import { TransportEngine } from "../audio-core/transport/transport-engine";
import { SchedulerEngine } from "../audio-core/scheduler/scheduler-engine";
import { MixerEngine } from "../audio-core/mixer/mixer-engine";
import { SampleCache } from "./sample-cache";
import { CommandManager } from "../audio-core/commands/command-manager";
import { OfflineRenderer } from "../audio-core/export/offline-renderer";
import { AudioRecorder } from "../audio-core/recording/audio-recorder";
import { MidiNote } from "../midi/midi-types";

export class AudioCoreEngine {
  public audioCtx: AudioContext | null = null;
  public masterGain!: GainNode;

  public transport: TransportEngine;
  public scheduler: SchedulerEngine;
  public mixer = new MixerEngine();
  public cache = new SampleCache();
  public commands = new CommandManager();
  
  // Phase 6 Offline Renderer and Phase 7 Audio Recorder instances
  public renderer = new OfflineRenderer();
  public recorder = new AudioRecorder();

  // Active configurations checked dynamically by timing scheduler ticks
  public getActiveNotes: (() => MidiNote[]) | null = null;
  public getHeldKeys: (() => number[]) | null = null;

  public arpEnabled = false;
  public arpDivision: "1/8" | "1/16" | "1/32" = "1/16";
  public arpPattern: "up" | "down" | "random" = "up";
  public noteRepeatEnabled = false;
  public noteRepeatDivision: "1/8" | "1/16" | "1/32" = "1/16";

  public onTickHook: ((absoluteTicks: number, preciseTime: number) => void) | null = null;

  constructor(options: {
    getBpm: () => number;
    getIsLooping: () => boolean;
    getLoopStart: () => number;
    getLoopEnd: () => number;
    triggerSynthNote: (midiNote: number, velocity: number, time: number, duration: number) => void;
    triggerDrumNote: (padId: number, velocity: number, time: number) => void;
    onPlayheadChange: (playhead: number) => void;
  }) {
    // 1. Instantiate the absolute ticks scheduler engine
    this.scheduler = new SchedulerEngine({
      triggerSynth: options.triggerSynthNote,
      triggerDrumPad: options.triggerDrumNote
    });

    // 2. Instantiate the background interval lookahead clock transport engine
    this.transport = new TransportEngine({
      getBpm: options.getBpm,
      getIsLooping: options.getIsLooping,
      getLoopStart: options.getLoopStart,
      getLoopEnd: options.getLoopEnd,
      getAudioContextTime: () => this.audioCtx ? this.audioCtx.currentTime : 0,
      onTick: (absoluteTicks, preciseTime) => {
        const activeNotes = this.getActiveNotes ? this.getActiveNotes() : [];
        const heldKeys = this.getHeldKeys ? this.getHeldKeys() : [];

        // Distribute ticks to scheduler
        this.scheduler.schedule(
          absoluteTicks,
          preciseTime,
          options.getBpm(),
          activeNotes,
          heldKeys,
          this.arpEnabled,
          this.arpDivision,
          this.arpPattern,
          this.noteRepeatEnabled,
          this.noteRepeatDivision
        );

        if (this.onTickHook) {
          this.onTickHook(absoluteTicks, preciseTime);
        }
      },
      onPlayheadChange: options.onPlayheadChange
    });
  }

  /**
   * Safe web audio host setup inside browser context.
   */
  public initAudioContext() {
    if (!this.audioCtx && typeof window !== "undefined") {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.connect(this.audioCtx.destination);
          this.masterGain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);

          // Bootstrap Mixer graph fader lines
          this.mixer.initialize(this.audioCtx);
        }
      } catch (e) {
        console.warn("Decoupled AudioCoreEngine failed context creation:", e);
      }
    }
  }

  /**
   * Resets active transport threads and summation lines safely preventing memory leaks.
   */
  public destroy() {
    try {
      this.transport.destroy();
    } catch (e) {
      console.debug(e);
    }
    this.mixer.clearAll();
    this.cache.clearAll();
    this.commands.clearAll();
    try {
      this.recorder.destroy();
    } catch (e) {
      console.debug(e);
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {
        console.debug(e);
      }
      this.audioCtx = null;
    }
  }
}
