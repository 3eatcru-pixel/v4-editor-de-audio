/**
 * Transport and Timing Engine Sub-module.
 * Pure-TypeScript implementation with zero Angular dependencies.
 * Handles the background Worker thread, tempo, playheads, loops, and lookahead scheduling ticks.
 */
export interface TransportConfig {
  getBpm: () => number;
  getIsPlaying: () => boolean;
  getPlayhead: () => number;
  setPlayhead: (pos: number) => void;
  getIsLooping: () => boolean;
  getLoopStart: () => number;
  getLoopEnd: () => number;
  getAudioContextTime: () => number;
  setCurrentStepSignal: (step: number) => void;
  onScheduleNote: (sixteenthNoteNumber: number, time: number) => void;
}

export class TransportEngine {
  private clockWorker: Worker | null = null;
  private lastTime = 0;
  private currentEighthNote = 0; // index of the active sixteenth note
  private lastSetPlayhead = 0;
  private nextEventTime = 0;

  constructor(private config: TransportConfig) {}

  /**
   * Starts the transport engine and instantiates the background web worker thread.
   */
  start() {
    const playheadBeats = this.config.getPlayhead();
    this.currentEighthNote = Math.floor(playheadBeats * 4);
    this.lastSetPlayhead = playheadBeats;
    
    // Restart lookahead slightly ahead of context
    this.nextEventTime = this.config.getAudioContextTime() + 0.1;
    this.lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (!this.clockWorker) {
      const workerCode = `
        let timer = null;
        self.onmessage = (e) => {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(() => self.postMessage('tick'), 16);
          } else if (e.data === 'stop') {
            clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.clockWorker = new Worker(URL.createObjectURL(blob));
      this.clockWorker.onmessage = () => {
        this.tick(typeof performance !== "undefined" ? performance.now() : Date.now());
      };
    }
    
    this.clockWorker.postMessage('start');
    this.tick(this.lastTime);
  }

  /**
   * Pauses the transport clock loop.
   */
  pause() {
    if (this.clockWorker) {
      this.clockWorker.postMessage('stop');
    }
  }

  /**
   * Sound engine tick. Evaluates timeline positions and fires the lookahead schedulers.
   */
  private tick(now: number) {
    if (!this.config.getIsPlaying()) return;

    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    const bpm = this.config.getBpm();
    const beatsPerSecond = bpm / 60;
    const deltaBeats = (deltaMs / 1000) * beatsPerSecond;

    // Detect external seek from the UI
    const currentPos = this.config.getPlayhead();
    const expectedPos = this.lastSetPlayhead;
    if (Math.abs(currentPos - expectedPos) > 0.05) {
      this.currentEighthNote = Math.floor(currentPos * 4);
      this.nextEventTime = this.config.getAudioContextTime() + 0.1;
    }

    // Update playhead
    let nextPos = currentPos + deltaBeats;
    const isLooping = this.config.getIsLooping();
    const loopStartValue = this.config.getLoopStart();
    const loopEndValue = this.config.getLoopEnd();

    if (isLooping && nextPos >= loopEndValue) {
      nextPos = loopStartValue + (nextPos % Math.max(0.1, loopEndValue - loopStartValue));
      this.currentEighthNote = Math.floor(nextPos * 4);
    }
    
    this.config.setPlayhead(nextPos);
    this.lastSetPlayhead = nextPos;

    // Schedule audio steps
    const secondsPerBeat = 60.0 / bpm;
    const ctxTime = this.config.getAudioContextTime();

    // Lookahead approach for scheduling (0.1s preview window)
    while (this.nextEventTime < ctxTime + 0.1) {
      this.config.onScheduleNote(this.currentEighthNote, this.nextEventTime);

      // Update UI step
      const stepIndex = this.currentEighthNote % 16;
      this.config.setCurrentStepSignal(stepIndex);

      this.nextEventTime += 0.25 * secondsPerBeat; // Sixteenth note step instead of eighth
      this.currentEighthNote++;
      
      if (isLooping) {
        const loopEnd16ths = Math.floor(loopEndValue * 4);
        const loopStart16ths = Math.floor(loopStartValue * 4);
        if (this.currentEighthNote >= loopEnd16ths) {
           this.currentEighthNote = loopStart16ths;
        }
      }
    }
  }

  /**
   * Direct manual sync reset on seeks or tempo shifts.
   */
  forceSync() {
    const pos = this.config.getPlayhead();
    this.currentEighthNote = Math.floor(pos * 4);
    this.lastSetPlayhead = pos;
    this.nextEventTime = this.config.getAudioContextTime() + 0.1;
  }

  /**
   * Cleanup method to terminate clock worker.
   */
  destroy() {
    this.pause();
    if (this.clockWorker) {
      this.clockWorker.terminate();
      this.clockWorker = null;
    }
  }
}
