import { eventBus } from "../events/event-bus";

/**
 * Professional decoupled TransportEngine (Phase 1).
 * Pure-TypeScript core timed sequencer coordinator with zero framework overhead.
 */
export interface TransportConfig {
  getBpm: () => number;
  getIsLooping: () => boolean;
  getLoopStart: () => number;
  getLoopEnd: () => number;
  getAudioContextTime: () => number;
  onTick: (absoluteTicks: number, preciseTime: number) => void;
  onPlayheadChange: (playhead: number) => void;
}

export class TransportEngine {
  private clockWorker: Worker | null = null;
  private lastTime = 0;
  private currentTick = 0; // micro-ticks index based on PPQ (960 ticks per beat)
  private absoluteTicksPos = 0;
  private nextEventTime = 0;
  private playheadPosition = 0;
  private activeBpm = 120;

  // Parts Per Quarter Note (Beats) resolution
  public readonly PPQ = 960;

  constructor(private config: TransportConfig) {
    this.activeBpm = this.config.getBpm();
  }

  /**
   * Safe retrieve of ticks count matching active playhead position.
   */
  public getTicks(): number {
    return this.currentTick;
  }

  /**
   * Set active playhead beats and instantly sync sequencer ticks.
   */
  public seek(beatPosition: number) {
    this.playheadPosition = Math.max(0, beatPosition);
    this.currentTick = Math.floor(this.playheadPosition * this.PPQ);
    this.nextEventTime = this.config.getAudioContextTime() + 0.05;
    this.config.onPlayheadChange(this.playheadPosition);
    eventBus.publishPlayheadChange({ playhead: this.playheadPosition });
  }

  /**
   * Triggers the playback start sequence.
   */
  public play() {
    this.seek(this.playheadPosition);
    this.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.nextEventTime = this.config.getAudioContextTime() + 0.02;

    this.bootstrapWorker();
    if (this.clockWorker) {
      this.clockWorker.postMessage("start");
    }
    eventBus.publishPlay();
  }

  /**
   * Pauses the playback loop.
   */
  public pause() {
    if (this.clockWorker) {
      this.clockWorker.postMessage("stop");
    }
    eventBus.publishPause();
  }

  /**
   * Stop sequence - returns playhead to beginning context.
   */
  public stop() {
    this.pause();
    this.seek(0);
    eventBus.publishStop();
  }

  /**
   * Setup of background thread setInterval ticker.
   */
  private bootstrapWorker() {
    if (this.clockWorker) return;

    // Fast, lightweight interval lookahead clock (10ms granularity)
    const workerCode = `
      let timer = null;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          if (!timer) timer = setInterval(() => self.postMessage('tick'), 10);
        } else if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    this.clockWorker = new Worker(URL.createObjectURL(blob));
    this.clockWorker.onmessage = () => {
      this.tick();
    };
  }

  /**
   * Central sound-graph timing cycle calculation fader.
   */
  private tick() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.lastTime === 0) {
      this.lastTime = now;
      return;
    }

    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    this.activeBpm = this.config.getBpm();
    const beatsPerSecond = this.activeBpm / 60.0;
    const deltaBeats = (deltaMs / 1000.0) * beatsPerSecond;

    // Standard linear updates
    let nextBeats = this.playheadPosition + deltaBeats;

    const isLooping = this.config.getIsLooping();
    const lStart = this.config.getLoopStart();
    const lEnd = this.config.getLoopEnd();

    if (isLooping && nextBeats >= lEnd) {
      const loopLen = Math.max(0.1, lEnd - lStart);
      nextBeats = lStart + ((nextBeats - lStart) % loopLen);
      this.currentTick = Math.floor(nextBeats * this.PPQ);
    }

    this.playheadPosition = nextBeats;
    this.config.onPlayheadChange(this.playheadPosition);
    eventBus.publishPlayheadChange({ playhead: this.playheadPosition });

    // Precise scheduling lookup window (100ms look-ahead fader)
    const ctxTime = this.config.getAudioContextTime();
    const secondsPerBeat = 60.0 / this.activeBpm;
    const secondsPerTick = secondsPerBeat / this.PPQ;

    while (this.nextEventTime < ctxTime + 0.12) {
      // Fire scheduler event
      this.config.onTick(this.currentTick, this.nextEventTime);
      eventBus.publishTick({ absoluteTicks: this.currentTick, preciseTime: this.nextEventTime });

      // Increment ticks count (equivalent to a custom PPQ tick rate step)
      // Standard lookahead scheduling increments by sixteenth notes (240 ticks) for efficiency
      const ticksStep = 240; 
      this.currentTick += ticksStep;
      this.nextEventTime += ticksStep * secondsPerTick;

      if (isLooping && this.currentTick >= Math.floor(lEnd * this.PPQ)) {
        this.currentTick = Math.floor(lStart * this.PPQ);
      }
    }
  }

  /**
   * Clear resources.
   */
  public destroy() {
    this.pause();
    if (this.clockWorker) {
      this.clockWorker.terminate();
      this.clockWorker = null;
    }
  }
}
