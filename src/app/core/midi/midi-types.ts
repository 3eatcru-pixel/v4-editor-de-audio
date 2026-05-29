export interface MidiNote {
  id: string;
  note: number;       // Midi note value (e.g., 60 = C4, 36 = C2)
  velocity: number;   // 0 to 127 velocity factor
  startTick: number;  // Position inside the clip in micro-ticks
  lengthTick: number; // Note duration in micro-ticks
  channel: number;    // MIDI Channel or instrument rack target
  selected?: boolean; // Editor select handle
}

export interface MidiAutomation {
  type: string;       // "pitchbend" | "modwheel" | "aftertouch" | "expression"
  points: { startTick: number; value: number }[];
}

export interface MidiClip {
  id: string;
  notes: MidiNote[];
  automation: MidiAutomation[];
  scale: string;      // e.g. "Chromatic" | "Major" | "Natural Minor" | "Pentatonic"
  key: string;        // e.g. "C" | "G#" | "D" | "A"
  bpm: number;
  loop: boolean;
}

// PPQ (Parts Per Quarter-note) defining sub-tick master timebase resolution
export const MIDI_PPQ = 960; // 960 ticks = 1 Quarter note (Beat)
