import { Injectable, inject, signal } from '@angular/core';
import { ProjectService, Track } from './project.service';
import { WorkspaceService } from './workspace.service';

export interface HistorySnapshot {
  bpm: number;
  tracks: Track[];
  sequence: { instrument: string; color: string; steps: boolean[] }[];
  pianoNotes: { id: string; x: number; y: number; w: number; h: number }[];
}

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private project = inject(ProjectService);
  private workspace = inject(WorkspaceService);

  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  // Reactive state signals for UI indicators and shortcuts
  canUndo = signal(false);
  canRedo = signal(false);

  private isApplying = false;

  constructor() {
    // Wait until services have populated their default states
    setTimeout(() => {
      this.pushState(true);
    }, 100);
  }

  /**
   * Captures a deep snapshot copy of current active project track channels, sequencer steps, 
   * piano notes, and tempo bpm factors, storing them to the history stack.
   */
  pushState(isInitial = false) {
    if (this.isApplying) return;

    const snapshot: HistorySnapshot = {
      bpm: this.project.bpm(),
      tracks: JSON.parse(JSON.stringify(this.project.tracks())),
      sequence: JSON.parse(JSON.stringify(this.project.sequence())),
      pianoNotes: JSON.parse(JSON.stringify(this.workspace.pianoNotes())),
    };

    if (isInitial) {
      this.undoStack = [snapshot];
      this.redoStack = [];
    } else {
      // Avoid inserting duplicate identical entries to keep stack clean
      const last = this.undoStack[this.undoStack.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snapshot)) {
        return;
      }
      this.undoStack.push(snapshot);
      this.redoStack = []; // Clear redo stack on active input action
    }

    // Retain maximum history depth of 50 actions to keep memory optimized
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }

    this.updateSignals();
  }

  /**
   * Reverts back to the previous editor step snapshot.
   */
  undo() {
    if (this.undoStack.length <= 1) return null; // keep original state

    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    const previous = this.undoStack[this.undoStack.length - 1];

    this.isApplying = true;
    try {
      this.applySnapshot(previous);
    } finally {
      this.isApplying = false;
    }

    this.updateSignals();
    return "Undone changes successfully.";
  }

  /**
   * Re-applies an undone editor step snapshot.
   */
  redo() {
    if (this.redoStack.length === 0) return null;

    const next = this.redoStack.pop()!;
    this.undoStack.push(next);

    this.isApplying = true;
    try {
      this.applySnapshot(next);
    } finally {
      this.isApplying = false;
    }

    this.updateSignals();
    return "Redone changes successfully.";
  }

  private applySnapshot(snap: HistorySnapshot) {
    this.project.bpm.set(snap.bpm);
    this.project.tracks.set(JSON.parse(JSON.stringify(snap.tracks)));
    this.project.sequence.set(JSON.parse(JSON.stringify(snap.sequence)));
    this.workspace.pianoNotes.set(JSON.parse(JSON.stringify(snap.pianoNotes)));
    
    // Clear selected clip state to prevent references to deleted clip ids
    this.workspace.selectedClipId.set(null);
  }

  private updateSignals() {
    this.canUndo.set(this.undoStack.length > 1);
    this.canRedo.set(this.redoStack.length > 0);
  }
}
