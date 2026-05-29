import { Injectable, inject, signal } from "@angular/core";
import { MidiEngineService } from "./midi-engine.service";
import { InstrumentRackService } from "../instruments/instrument-rack.service";
import { ProjectService } from "../project.service";
import { MIDI_PPQ } from "./midi-types";

@Injectable({ providedIn: "root" })
export class MidiSchedulerService {
  private midiEngine = inject(MidiEngineService);
  private instrumentRack = inject(InstrumentRackService);
  private project = inject(ProjectService);

  // Note Repeat Configuration (mostly for Drums / Live Pads performance)
  noteRepeatEnabled = signal<boolean>(false);
  noteRepeatDivision = signal<"1/8" | "1/16" | "1/32">("1/16");

  // Arpeggiator Configuration
  arpEnabled = signal<boolean>(false);
  arpDivision = signal<"1/8" | "1/16" | "1/32">("1/16");
  arpPattern = signal<"up" | "down" | "random">("up");

  private lastScheduledSixteenth = -1;

  // Active held note buffer for live performance triggers
  heldKeys = new Set<number>();

  addHeldKey(note: number) {
    this.heldKeys.add(note);
    if (this.arpEnabled()) {
      this.triggerArp();
    } else {
      // Direct Live Synth fire
      this.instrumentRack.triggerSynth(note, 100, 0, 0.4);
    }
  }

  removeHeldKey(note: number) {
    this.heldKeys.delete(note);
  }

  /**
   * Synchronized Scheduler Tick, queried by AudioEngine frame loop.
   * Plays corresponding MIDI notes with precise sub-step sample offset.
   */
  scheduleMidiClips(sixteenthNoteNumber: number, absoluteTime: number, bpm: number, synthOut?: AudioNode, drumOut?: AudioNode) {
    if (sixteenthNoteNumber === this.lastScheduledSixteenth) return;
    this.lastScheduledSixteenth = sixteenthNoteNumber;

    const stepStartTick = sixteenthNoteNumber * 240; // 960 PPQ / 4 = 240 ticks per 16th note
    const stepEndTick = stepStartTick + 240;

    const notes = this.midiEngine.activeNotes;
    const secondsPerBeat = 60.0 / bpm;

    for (const note of notes) {
      // Look for notes within the current 16th-note window
      if (note.startTick >= stepStartTick && note.startTick < stepEndTick) {
        const tickOffset = note.startTick - stepStartTick;
        const beatOffset = tickOffset / MIDI_PPQ;
        const precisePlayTime = absoluteTime + (beatOffset * secondsPerBeat);
        const durationSeconds = (note.lengthTick / MIDI_PPQ) * secondsPerBeat;

        if (note.channel === 9) {
          // Channel 9 mapping - Drum Sampler triggers
          const padId = (note.note % 8) + 1;
          this.instrumentRack.triggerDrumPad(padId, note.velocity, precisePlayTime, drumOut);
        } else {
          // Channel 1-8 mapping - Virtual Analog Synth
          this.instrumentRack.triggerSynth(note.note, note.velocity, precisePlayTime, durationSeconds, synthOut);
        }
      }
    }

    // Trigger Arp / Repeat cycles synchronized of active transport playhead
    if (this.arpEnabled() && this.heldKeys.size > 0) {
      const divisionFactor = this.getDivisionFactor(this.arpDivision());
      if (sixteenthNoteNumber % divisionFactor === 0) {
        this.fireArpNote(absoluteTime, synthOut);
      }
    }

    if (this.noteRepeatEnabled()) {
      const divisionFactor = this.getDivisionFactor(this.noteRepeatDivision());
      if (sixteenthNoteNumber % divisionFactor === 0) {
        // Repeat the last played or lowest active key
        const activeNotes = Array.from(this.heldKeys);
        if (activeNotes.length > 0) {
          const noteToRepeat = activeNotes[activeNotes.length - 1];
          this.instrumentRack.triggerSynth(noteToRepeat, 110, absoluteTime, 0.1, synthOut);
        }
      }
    }
  }

  private getDivisionFactor(div: "1/8" | "1/16" | "1/32"): number {
    switch (div) {
      case "1/8": return 2;  // triggers every 2nd sixteenth step
      case "1/16": return 1; // triggers every sixteenth step
      case "1/32": return 0.5; // triggers sub-step division
    }
    return 1;
  }

  private triggerArp() {
    // If not playing, trigger first note immediately
    if (!this.project.isPlaying() && this.heldKeys.size > 0) {
      const keys = Array.from(this.heldKeys).sort((a,b) => a-b);
      this.instrumentRack.triggerSynth(keys[0], 100, 0, 0.2);
    }
  }

  private arpIndex = 0;
  private fireArpNote(time: number, out?: AudioNode) {
    const keys = Array.from(this.heldKeys).sort((a, b) => a - b);
    if (keys.length === 0) return;

    let noteToPlay = keys[0];
    const pattern = this.arpPattern();

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
      // random pattern
      const rndIdx = Math.floor(Math.random() * keys.length);
      noteToPlay = keys[rndIdx];
    }

    this.instrumentRack.triggerSynth(noteToPlay, 100, time, 0.15, out);
  }
}
