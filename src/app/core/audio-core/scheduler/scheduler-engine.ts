import { MidiNote, MIDI_PPQ } from "../../midi/midi-types";
import { Subscription } from "rxjs";
import { eventBus } from "../events/event-bus";

export interface SchedulerCallback {
  triggerSynth: (midiNote: number, velocity: number, startTime: number, duration: number) => void;
  triggerDrumPad: (padId: number, velocity: number, startTime: number) => void;
}

export class SchedulerEngine {
  private lastScheduledTick = -1;
  private arpIndex = 0;
  private subscription: Subscription | null = null;

  constructor(private callbacks: SchedulerCallback) {}

  /**
   * Main scheduling sweep.
   * Compares active list events against current ticking search windows.
   */
  public schedule(
    currentTick: number,
    preciseTime: number,
    bpm: number,
    activeMidiNotes: MidiNote[],
    heldKeys: number[],
    arpEnabled: boolean,
    arpDivision: "1/8" | "1/16" | "1/32",
    arpPattern: "up" | "down" | "random",
    noteRepeatEnabled: boolean,
    noteRepeatDivision: "1/8" | "1/16" | "1/32"
  ) {
    if (currentTick === this.lastScheduledTick) return;
    this.lastScheduledTick = currentTick;

    const tickWindowSize = 240; // standard 1/16th note division window
    const tickEnd = currentTick + tickWindowSize;
    const secondsPerBeat = 60.0 / bpm;

    // 1. Process Timeline sequencer notes
    for (const note of activeMidiNotes) {
      if (note.startTick >= currentTick && note.startTick < tickEnd) {
        const offsetTicks = note.startTick - currentTick;
        const beatOffset = offsetTicks / MIDI_PPQ;
        const exactPlayTime = preciseTime + (beatOffset * secondsPerBeat);
        const durationSeconds = (note.lengthTick / MIDI_PPQ) * secondsPerBeat;

        if (note.channel === 9) {
          const padId = (note.note % 8) + 1;
          this.callbacks.triggerDrumPad(padId, note.velocity, exactPlayTime);
        } else {
          this.callbacks.triggerSynth(note.note, note.velocity, exactPlayTime, durationSeconds);
        }
      }
    }

    // Convert Tick boundary to equivalent sixteenth step index
    const sixteenthStep = Math.floor(currentTick / 240);

    // 2. Process Arp loop
    if (arpEnabled && heldKeys.length > 0) {
      const divFactor = this.getDivisionFactor(arpDivision);
      if (sixteenthStep % divFactor === 0) {
        this.fireArpNote(heldKeys, arpPattern, preciseTime);
      }
    }

    // 3. Process Note repeat loop
    if (noteRepeatEnabled && heldKeys.length > 0) {
      const divFactor = this.getDivisionFactor(noteRepeatDivision);
      if (sixteenthStep % divFactor === 0) {
        const repeatNote = heldKeys[heldKeys.length - 1]; // repeat last held pitch
        this.callbacks.triggerSynth(repeatNote, 110, preciseTime, 0.12);
      }
    }
  }

  private getDivisionFactor(div: "1/8" | "1/16" | "1/32"): number {
    switch (div) {
      case "1/8": return 2;  // triggers every 2nd sixteenth subdivision step
      case "1/16": return 1; // triggers on every sixteenth step
      case "1/32": return 0.5; // triggers sub-steps
    }
    return 1;
  }

  private fireArpNote(heldNotes: number[], pattern: "up" | "down" | "random", time: number) {
    const keys = [...heldNotes].sort((a, b) => a - b);
    if (keys.length === 0) return;

    let noteToPlay = keys[0];
    if (pattern === "up") {
      this.arpIndex = this.arpIndex % keys.length;
      noteToPlay = keys[this.arpIndex];
      this.arpIndex++;
    } else if (pattern === "down") {
      if (this.arpIndex < 0 || this.arpIndex >= keys.length) {
        this.arpIndex = keys.length - 1;
      }
      noteToPlay = keys[this.arpIndex];
      this.arpIndex--;
    } else {
      const rndIdx = Math.floor(Math.random() * keys.length);
      noteToPlay = keys[rndIdx];
    }

    this.callbacks.triggerSynth(noteToPlay, 100, time, 0.15);
  }

  /**
   * Starts listening to EventBus transport ticks to trigger scheduling cycle automatically and decouple caller.
   */
  public startListening(config: {
    getBpm: () => number;
    getActiveNotes: () => MidiNote[];
    getHeldKeys: () => number[];
    getArpEnabled: () => boolean;
    getArpDivision: () => "1/8" | "1/16" | "1/32";
    getArpPattern: () => "up" | "down" | "random";
    getNoteRepeatEnabled: () => boolean;
    getNoteRepeatDivision: () => "1/8" | "1/16" | "1/32";
  }) {
    this.stopListening();
    this.subscription = eventBus.onTick$().subscribe(({ absoluteTicks, preciseTime }) => {
      this.schedule(
        absoluteTicks,
        preciseTime,
        config.getBpm(),
        config.getActiveNotes(),
        config.getHeldKeys(),
        config.getArpEnabled(),
        config.getArpDivision(),
        config.getArpPattern(),
        config.getNoteRepeatEnabled(),
        config.getNoteRepeatDivision()
      );
    });
  }

  /**
   * Safe teardown of event stream listener.
   */
  public stopListening() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }
}
