import { Injectable, signal, inject } from "@angular/core";
import { MidiClip, MidiNote, MIDI_PPQ } from "./midi-types";
import { WorkspaceService } from "../workspace.service";

@Injectable({ providedIn: "root" })
export class MidiEngineService {
  private workspace = inject(WorkspaceService);

  // Active loaded midi clip mapping
  midiClips = signal<Map<string, MidiClip>>(new Map());

  // Current editor active clip id
  activeClipId = signal<string>("default-midi-clip");

  // Selected note identifiers
  selectedNoteIds = signal<Set<string>>(new Set());

  // Creative Scale Helpers
  editorScale = signal<string>("Natural Minor");
  editorKey = signal<string>("C");
  lockToScale = signal<boolean>(false);
  showGhostNotes = signal<boolean>(true);

  // Velocity Editor active selection factor
  defaultVelocity = signal<number>(100);

  // Scale degrees mapping
  private scalesMap: Record<string, number[]> = {
    "Chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    "Major": [0, 2, 4, 5, 7, 9, 11],
    "Natural Minor": [0, 2, 3, 5, 7, 8, 10],
    "Pentatonic Minor": [0, 3, 5, 7, 10],
    "Dorian": [0, 2, 3, 5, 7, 9, 10],
    "Phrygian": [0, 1, 3, 5, 7, 8, 10],
    "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  };

  constructor() {
    this.bootstrapDefaultClip();
  }

  private bootstrapDefaultClip() {
    const defaultClip: MidiClip = {
      id: "default-midi-clip",
      notes: [
        { id: "n1", note: 60, velocity: 100, startTick: 0, lengthTick: 480, channel: 1 },
        { id: "n2", note: 63, velocity: 110, startTick: 480, lengthTick: 480, channel: 1 },
        { id: "n3", note: 67, velocity: 95, startTick: 960, lengthTick: 960, channel: 1 },
        { id: "n4", note: 65, velocity: 100, startTick: 1920, lengthTick: 480, channel: 1 },
        { id: "n5", note: 60, velocity: 105, startTick: 2400, lengthTick: 480, channel: 1 },
        { id: "n6", note: 58, velocity: 90, startTick: 2880, lengthTick: 960, channel: 1 },
      ],
      automation: [],
      scale: "Natural Minor",
      key: "C",
      bpm: 120,
      loop: true,
    };

    const map = new Map<string, MidiClip>();
    map.set(defaultClip.id, defaultClip);
    this.midiClips.set(map);
  }

  getOrCreateClip(clipId: string): MidiClip {
    const map = this.midiClips();
    let clip = map.get(clipId);
    if (!clip) {
      clip = {
        id: clipId,
        notes: [],
        automation: [],
        scale: this.editorScale(),
        key: this.editorKey(),
        bpm: 120,
        loop: true,
      };
      map.set(clipId, clip);
      this.midiClips.set(new Map(map));
    }
    return clip;
  }

  get activeNotes(): MidiNote[] {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    return this.getOrCreateClip(clipId).notes;
  }

  addNote(note: MidiNote) {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    
    // Add new note
    clip.notes = [...clip.notes, note];
    this.updateClipInStore(clipId, clip);
  }

  removeNote(noteId: string) {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    clip.notes = clip.notes.filter((n) => n.id !== noteId);
    this.updateClipInStore(clipId, clip);

    const sel = this.selectedNoteIds();
    if (sel.has(noteId)) {
      sel.delete(noteId);
      this.selectedNoteIds.set(new Set(sel));
    }
  }

  updateNote(noteId: string, updates: Partial<MidiNote>) {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    clip.notes = clip.notes.map((n) => {
      if (n.id === noteId) {
        return { ...n, ...updates };
      }
      return n;
    });
    this.updateClipInStore(clipId, clip);
  }

  private updateClipInStore(clipId: string, clip: MidiClip) {
    const map = this.midiClips();
    map.set(clipId, clip);
    this.midiClips.set(new Map(map));
  }

  /**
   * Snaps a ticks timestamp into grid divisions
   */
  snapTicks(ticks: number, stepName: "1/4" | "1/8" | "1/16" | "1/32" | "Off"): number {
    if (stepName === "Off") return ticks;
    
    let stepTicks = 240; // 1/16 standard
    switch (stepName) {
      case "1/4": stepTicks = MIDI_PPQ; break;
      case "1/8": stepTicks = MIDI_PPQ / 2; break;
      case "1/16": stepTicks = MIDI_PPQ / 4; break;
      case "1/32": stepTicks = MIDI_PPQ / 8; break;
    }
    return Math.round(ticks / stepTicks) * stepTicks;
  }

  /**
   * Quantizes start ticks of selected notes or all notes on the current active edit clip
   */
  quantizeActiveNotes(stepName: "1/4" | "1/8" | "1/16" | "1/32") {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    const selected = this.selectedNoteIds();

    clip.notes = clip.notes.map((n) => {
      if (selected.size === 0 || selected.has(n.id)) {
        const snappedStart = this.snapTicks(n.startTick, stepName);
        return { ...n, startTick: snappedStart };
      }
      return n;
    });

    this.updateClipInStore(clipId, clip);
  }

  /**
   * Transposes selected MIDI notes by semitones
   */
  transposeSelection(semitones: number) {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    const selected = this.selectedNoteIds();

    if (selected.size === 0) return;

    clip.notes = clip.notes.map((n) => {
      if (selected.has(n.id)) {
        let targetNote = n.note + semitones;
        // Keep inside MIDI standard 0 - 127
        targetNote = Math.max(12, Math.min(targetNote, 115));
        return { ...n, note: targetNote };
      }
      return n;
    });

    this.updateClipInStore(clipId, clip);
  }

  /**
   * Duplicates selected notes and appends them directly at the end of the group
   */
  duplicateSelection() {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    const selected = this.selectedNoteIds();

    if (selected.size === 0) return;

    const notesToDuplicate = clip.notes.filter((n) => selected.has(n.id));
    
    // Find boundary times
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const n of notesToDuplicate) {
      if (n.startTick < minStart) minStart = n.startTick;
      if (n.startTick + n.lengthTick > maxEnd) maxEnd = n.startTick + n.lengthTick;
    }

    const duration = maxEnd - minStart;
    // Standard offset is snapped boundary duration
    const snapOffset = Math.max(MIDI_PPQ, duration);

    const newNotes: MidiNote[] = notesToDuplicate.map((n) => ({
      ...n,
      id: "note_dup_" + Math.random().toString(36).substr(2, 5),
      startTick: n.startTick + snapOffset,
      selected: true,
    }));

    // Deselect old notes
    clip.notes = clip.notes.map((n) => {
      if (selected.has(n.id)) {
        return { ...n, selected: false };
      }
      return n;
    });

    const newSelSet = new Set<string>();
    for (const n of newNotes) {
      newSelSet.add(n.id);
    }

    clip.notes = [...clip.notes, ...newNotes];
    this.selectedNoteIds.set(newSelSet);
    this.updateClipInStore(clipId, clip);
  }

  /**
   * Clears the active MIDI notes on the current clip
   */
  clearActiveClipNotes() {
    const clipId = this.workspace.selectedClipId() || this.activeClipId();
    const clip = this.getOrCreateClip(clipId);
    clip.notes = [];
    this.selectedNoteIds.set(new Set());
    this.updateClipInStore(clipId, clip);
  }

  /**
   * Validates if a MIDI key aligns inside selected scale degrees (for scale highlights or locking)
   */
  isNoteInScale(keyNumber: number): boolean {
    const scaleName = this.editorScale();
    const scaleDegrees = this.scalesMap[scaleName] || this.scalesMap["Chromatic"];
    const baseKeyIndex = this.getNoteKeyIndex(this.editorKey());

    const noteDegree = (keyNumber - baseKeyIndex + 120) % 12;
    return scaleDegrees.includes(noteDegree);
  }

  private getNoteKeyIndex(keyName: string): number {
    const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
    const idx = keys.indexOf(keyName);
    return idx === -1 ? 0 : idx;
  }
}
