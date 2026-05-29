import { Component, ElementRef, HostListener, inject, OnDestroy, OnInit, ViewChild, effect, PLATFORM_ID } from "@angular/core";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MidiEngineService } from "../../core/midi/midi-engine.service";
import { InstrumentRackService } from "../../core/instruments/instrument-rack.service";
import { MidiSchedulerService } from "../../core/midi/midi-scheduler.service";
import { ProjectService } from "../../core/project.service";
import { WorkspaceService } from "../../core/workspace.service";
import { MidiNote, MIDI_PPQ } from "../../core/midi/midi-types";

@Component({
  selector: "app-piano-roll-canvas",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col h-full bg-[#0d0d12] border border-[#1b1b26] rounded-xl overflow-hidden select-none">
      
      <!-- Top MIDI Editor Toolbar -->
      <div class="h-11 bg-[#09090d] border-b border-[#1b1b26] px-4 flex items-center justify-between shrink-0 text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold tracking-wider text-[#06b6d4]">PIANO ROLL v2.0</span>
          <div class="h-4 w-px bg-[#222] mx-2"></div>
          
          <!-- Tool Selection -->
          <div class="flex bg-[#12121e] rounded p-0.5 border border-[#1e1e2d]">
            <button (click)="activeTool = 'draw'" [class.bg-[#06b6d4]]="activeTool === 'draw'" [class.text-white]="activeTool === 'draw'" class="px-2.5 py-1 rounded text-white/60 hover:text-white flex items-center gap-1 transition-all border-none bg-transparent cursor-pointer">
              <mat-icon class="text-[13px] w-[13px] h-[13px]">edit</mat-icon> Draw
            </button>
            <button (click)="activeTool = 'erase'" [class.bg-[#ef4444]]="activeTool === 'erase'" [class.text-white]="activeTool === 'erase'" class="px-2.5 py-1 rounded text-white/60 hover:text-white flex items-center gap-1 transition-all border-none bg-transparent cursor-pointer">
              <mat-icon class="text-[13px] w-[13px] h-[13px]">delete</mat-icon> Erase
            </button>
            <button (click)="activeTool = 'select'" [class.bg-[#7c3aed]]="activeTool === 'select'" [class.text-white]="activeTool === 'select'" class="px-2.5 py-1 rounded text-white/60 hover:text-white flex items-center gap-1 transition-all border-none bg-transparent cursor-pointer">
              <mat-icon class="text-[13px] w-[13px] h-[13px]">border_outer</mat-icon> Select
            </button>
          </div>

          <!-- Align to Scale Lock -->
          <button (click)="toggleScaleLock()" [class.border-[#10b981]]="midiEngine.lockToScale()" [class.text-[#10b981]]="midiEngine.lockToScale()" class="px-2.5 py-1 rounded bg-[#12121e] border border-[#1e1e2d] text-white/60 hover:text-white flex items-center gap-1 cursor-pointer transition-colors">
            <mat-icon class="text-[13px] w-[13px] h-[13px]">lock</mat-icon> 
            Scale: {{ midiEngine.editorKey() }} {{ midiEngine.editorScale() }}
          </button>
        </div>

        <!-- MIDI Operations Menu -->
        <div class="flex items-center gap-2">
          <button (click)="quantizeSelection()" class="px-3 py-1 rounded bg-[#12121e] border border-[#1e1e2d] hover:bg-[#181829] hover:text-white text-white/80 transition-colors flex items-center gap-1 cursor-pointer">
            <mat-icon class="text-[12px] w-[12px] h-[12px]">grid_on</mat-icon> Quantize Grid
          </button>
          <button (click)="duplicateSelection()" class="px-3 py-1 rounded bg-[#12121e] border border-[#1e1e2d] hover:bg-[#181829] hover:text-white text-white/80 transition-colors flex items-center gap-1 cursor-pointer">
            <mat-icon class="text-[12px] w-[12px] h-[12px]">content_copy</mat-icon> Duplicate (Ctrl+D)
          </button>
          <button (click)="transposeSelection(12)" class="px-2 py-1 rounded bg-[#12121e] border border-[#1e1e2d] hover:bg-[#181829] hover:text-white text-white/80 cursor-pointer">+Oct</button>
          <button (click)="transposeSelection(-12)" class="px-2 py-1 rounded bg-[#12121e] border border-[#1e1e2d] hover:bg-[#181829] hover:text-white text-white/80 cursor-pointer">-Oct</button>
          <button (click)="clearAllNotes()" class="px-3 py-1 rounded bg-[#ef4444]/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1" title="Clear all notes in the current MIDI clip sequence">
            <mat-icon class="text-[12px] w-[12px] h-[12px]">clear</mat-icon> Clear Notes
          </button>
        </div>
      </div>

      <!-- Core Editor split screens -->
      <div class="flex flex-1 min-h-0 relative">
        
        <!-- Left Side: Interactive chromatic keys sidebar -->
        <div class="w-16 bg-[#09090d] border-r border-[#1b1b26] flex flex-col relative overflow-hidden select-none" #keysContainer>
          <div class="absolute w-full flex flex-col" [style.top]="'-' + viewScrollY + 'px'">
            @for (key of visibleKeys; track key.midiIndex) {
              <div 
                [class.bg-black]="key.isBlack" 
                [class.bg-white]="!key.isBlack" 
                [class.text-neutral-500]="!key.isBlack" 
                [class.text-neutral-400]="key.isBlack" 
                [style.height]="noteHeight + 'px'"
                (mousedown)="onKeyMouseDown(key.midiIndex)"
                class="w-full relative flex items-center justify-end pr-1 border-b border-[#222]/20 font-mono text-[9px] font-bold cursor-pointer transition-colors active:bg-[#06b6d4]/45">
                <span>{{ key.name }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Right Side: Canvas Grid Container -->
        <div class="flex-1 flex flex-col min-w-0 relative h-full">
          
          <!-- MIDI Time Ruler -->
          <div class="h-6 w-full bg-gradient-to-b from-[#13131d] to-[#09090d] border-b border-[#1b1b26] relative overflow-hidden flex-shrink-0 cursor-text select-none pointer-events-none">
            <div class="absolute top-0 bottom-0 pointer-events-none w-full" [style.transform]="'translateX(' + -viewScrollX + 'px)'">
               @for (bar of [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]; track bar) {
                 <!-- Bar Marker -->
                 <div
                   class="h-full border-l border-[#3a3a4c] absolute top-0 flex flex-col justify-start"
                   [style.left.px]="bar * beatWidth * 4"
                 >
                   <span class="pl-1 text-[#e2e8f0] text-[9.5px] font-bold leading-none tracking-wider">{{ bar + 1 }}</span>
                 </div>
                 
                 <!-- Quarter Notes (Beats) -->
                 @if (beatWidth > 20) {
                   @for (beat of [1, 2, 3]; track beat) {
                      <div
                       class="h-[8px] border-l border-[#292938] absolute bottom-0"
                       [style.left.px]="(bar * 4 + beat) * beatWidth"
                      ></div>
                   }
                 }
                 
                 <!-- 16th Notes -->
                 @if (beatWidth > 60) {
                   @for (sixteenth of [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2.25, 2.5, 2.75, 3.25, 3.5, 3.75]; track sixteenth) {
                      <div
                       class="h-[3px] border-l border-[#1a1a24] absolute bottom-0"
                       [style.left.px]="(bar * 4 + sixteenth) * beatWidth"
                      ></div>
                   }
                 }
               }
               
               <!-- Playhead Arrow inside MIDI Ruler -->
               <div 
                 class="absolute top-0 bottom-0 pointer-events-none z-50 flex items-end drop-shadow-md"
                 [style.left.px]="(project.playheadPosition() * beatWidth)">
                 <div class="w-[10px] h-2.5 text-[#eab308] -ml-[5px] flex justify-center items-end pb-[1px] shadow-[#eab308]/40">
                   <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor">
                     <path d="M0 0h10v3L5 7 0 3z" />
                   </svg>
                 </div>
               </div>
            </div>
          </div>

          <!-- Master Notes Roll grid -->
          <div class="flex-1 min-h-0 relative overflow-hidden" #gridScrollContainer (wheel)="onGridWheel($event)">
            <canvas #gridCanvas class="absolute inset-0 cursor-default" (mousedown)="onGridMouseDown($event)" (mousemove)="onGridMouseMove($event)" (mouseup)="onGridMouseUp($event)"></canvas>
            
            <!-- Pitch Guide overlay context -->
            @if (activeHoverNoteName) {
              <div class="absolute left-2 top-2 bg-[#09090d]/81 text-[9px] text-[#06b6d4] font-mono px-1.5 py-0.5 rounded border border-[#06b6d4]/20 pointer-events-none">
                {{ activeHoverNoteName }}
              </div>
            }
          </div>

          <!-- Horizontal Zoom sliders and playback scroll indicators -->
          <div class="h-6 bg-[#060609] border-t border-b border-[#1b1b26] flex items-center justify-between px-3 select-none text-[9px] text-neutral-500 shrink-0 font-mono">
            <div class="flex items-center gap-3">
              <span>SNAP: <b>{{ midiEngine.snapTicks(480, '1/16') === 480 ? '1/16' : 'Grid' }}</b></span>
              <span>GRID: 240 Ticks (1/16)</span>
            </div>
            <!-- Zoom controller slider -->
            <div class="flex items-center gap-2">
              <mat-icon class="text-[12px] w-[14px]">zoom_out</mat-icon>
              <input type="range" min="40" max="350" [value]="beatWidth" (input)="onZoomChange($any($event.target).value)" class="w-24 h-1 bg-[#1a1a24] appearance-none rounded cursor-pointer outline-none slider-thumb">
              <mat-icon class="text-[12px] w-[14px]">zoom_in</mat-icon>
              <div class="w-px h-3 bg-[#222]"></div>
              <!-- Vertical zoom helper -->
              <button (click)="adjustVerticalNoteHeight(1)" class="w-4 h-4 bg-[#12121e] hover:bg-[#1c1c2e] text-white/70 border border-[#222] flex items-center justify-center rounded cursor-pointer">+</button>
              <button (click)="adjustVerticalNoteHeight(-1)" class="w-4 h-4 bg-[#12121e] hover:bg-[#1c1c2e] text-white/70 border border-[#222] flex items-center justify-center rounded cursor-pointer">-</button>
            </div>
          </div>

          <!-- Bottom Velocity Editor pane -->
          <div class="h-28 bg-[#09090d] border-t border-[#1b1b26] relative overflow-hidden shrink-0" #velocityContainer>
            <canvas #velocityCanvas class="absolute inset-0 cursor-ns-resize" (mousedown)="onVelocityMouseDown($event)" (mousemove)="onVelocityMouseMove($event)" (mouseup)="onVelocityMouseUp($event)"></canvas>
            <span class="absolute top-1.5 left-3 text-[8px] font-mono font-bold tracking-widest text-[#7c3aed] pointer-events-none">VELOCITY ENGINE</span>
          </div>

        </div>

      </div>
    </div>
  `,
  styles: [`
    .slider-thumb::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 8px;
      width: 8px;
      border-radius: 50%;
      background: #06b6d4;
      cursor: pointer;
    }
  `]
})
export class PianoRollCanvasComponent implements OnInit, OnDestroy {
  midiEngine = inject(MidiEngineService);
  instrument = inject(InstrumentRackService);
  scheduler = inject(MidiSchedulerService);
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);
  platformId = inject(PLATFORM_ID);

  @ViewChild("gridCanvas", { static: true }) gridCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("velocityCanvas", { static: true }) velocityCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("gridScrollContainer", { static: true }) gridContainerRef!: ElementRef<HTMLDivElement>;

  // Zoom configurations
  beatWidth = 100;         // horizontal zoom: size of a beat (960 ticks) in pixels
  noteHeight = 18;         // vertical zoom: height of each midi row in pixels
  velocityHeight = 112;    // fixed height of bottom pane

  // View scroll positions
  viewScrollX = 0;
  viewScrollY = 320;       // start scrolled down. MIDI keys are centered around C4-C5
  maxGridTicks = 960 * 16; // 16 bars total length buffer

  // Tool Selection
  activeTool: "draw" | "erase" | "select" = "draw";

  // Hover Helpers
  activeHoverNoteName = "";

  // Chromatic representation structure
  visibleKeys: { midiIndex: number; name: string; isBlack: boolean }[] = [];

  // Drag interaction states
  private isDragging = false;
  private dragMode: "none" | "draw-add" | "move-notes" | "resize-notes" | "select-box" | "adjust-velocity" = "none";
  private selectionBoxStart = { x: 0, y: 0 };
  private selectionBoxEnd = { x: 0, y: 0 };

  private dragStartTicks = 0;
  private dragStartNote = 0;
  private originNotesState: { id: string; startTick: number; note: number }[] = [];

  private resizeTargetNoteId: string | null = null;

  // Animation frame loop
  private animId = 0;

  constructor() {
    this.initKeys();

    // Redraw if notes array or scale locking registers updates
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.midiEngine.midiClips();
      this.midiEngine.editorScale();
      this.midiEngine.editorKey();
      this.midiEngine.lockToScale();
      this.midiEngine.selectedNoteIds();
      this.requestDraw();
    });

    // Sync playhead ticking
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.project.playheadPosition();
      this.requestDraw();
    });
  }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.resizeCanvases();
    this.startDrawLoop();

    // Auto Center around C4 (MIDI Note 60 is index (127 - 60))
    const c4PixelY = (127 - 60) * this.noteHeight;
    this.viewScrollY = Math.max(0, c4PixelY - 140);
  }

  ngOnDestroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return;

    // Direct midi pitch mapping (A S D F G H J K white elements, W E T Y U black elements)
    const keyMap: Record<string, number> = {
      a: 60, // C4
      w: 61, // C#4
      s: 62, // D4
      e: 63, // D#4
      d: 64, // E4
      f: 65, // F4
      t: 66, // F#4
      g: 67, // G4
      y: 68, // G#4
      h: 69, // A4
      u: 70, // A#4
      j: 71, // B4
      k: 72, // C5
    };

    const midi = keyMap[e.key.toLowerCase()];
    if (midi !== undefined) {
      e.preventDefault();
      this.scheduler.addHeldKey(midi);
      this.requestDraw();
    }
  }

  @HostListener("window:keyup", ["$event"])
  onWindowKeyUp(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const keyMap: Record<string, number> = {
      a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72
    };

    const midi = keyMap[e.key.toLowerCase()];
    if (midi !== undefined) {
      this.scheduler.removeHeldKey(midi);
    }
  }

  private initKeys() {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    this.visibleKeys = [];
    for (let i = 127; i >= 0; i--) {
      const octave = Math.floor(i / 12) - 1;
      const noteName = noteNames[i % 12];
      const isBlack = noteName.includes("#");
      this.visibleKeys.push({
        midiIndex: i,
        name: `${noteName}${octave}`,
        isBlack
      });
    }
  }

  private resizeCanvases() {
    const parentContainer = this.gridContainerRef.nativeElement;
    const gridC = this.gridCanvasRef.nativeElement;
    gridC.width = parentContainer.clientWidth;
    gridC.height = parentContainer.clientHeight;

    const velC = this.velocityCanvasRef.nativeElement;
    velC.width = parentContainer.clientWidth;
    velC.height = 112; // matching template container h
  }

  onZoomChange(val: string) {
    this.beatWidth = parseInt(val, 10);
    this.requestDraw();
  }

  adjustVerticalNoteHeight(amt: number) {
    this.noteHeight = Math.max(12, Math.min(30, this.noteHeight + amt));
    this.requestDraw();
  }

  @HostListener("window:resize")
  onWindowResize() {
    this.resizeCanvases();
    this.requestDraw();
  }

  // --- Wheel Navigation (Y scrolling, X scrolling) ---
  onGridWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.shiftKey) {
      // Horizontal Scroll
      this.viewScrollX = Math.max(0, this.viewScrollX + e.deltaY * 0.8);
    } else {
      // Vertical Scroll
      const maxScrollY = 128 * this.noteHeight - this.gridCanvasRef.nativeElement.height;
      this.viewScrollY = Math.max(0, Math.min(maxScrollY, this.viewScrollY + e.deltaY * 0.6));
    }
    this.requestDraw();
  }

  // --- Key Trigger on Left Sidebar Click ---
  onKeyMouseDown(noteIndex: number) {
    this.instrument.triggerSynth(noteIndex, 110, 0, 0.45);
    this.midiEngine.defaultVelocity.set(110);
  }

  toggleScaleLock() {
    this.midiEngine.lockToScale.set(!this.midiEngine.lockToScale());
  }

  quantizeSelection() {
    this.midiEngine.quantizeActiveNotes("1/16");
    this.workspace.showToast("Quantization Completed", "Snapped MIDI note start bounds exactly to nearest 1/16 sixteenth grid line.");
    this.requestDraw();
  }

  duplicateSelection() {
    this.midiEngine.duplicateSelection();
    this.workspace.showToast("Selection Duplicated", "Pasted selected notes offset by grouped span boundaries.");
    this.requestDraw();
  }

  transposeSelection(semitones: number) {
    this.midiEngine.transposeSelection(semitones);
    const label = semitones > 0 ? `Shipped +${semitones} semitones` : `Shipped -${Math.abs(semitones)} semitones`;
    this.workspace.showToast("Selection Transposed", label);
    this.requestDraw();
  }

  clearAllNotes() {
    this.midiEngine.clearActiveClipNotes();
    this.workspace.showToast("Piano Grid Cleaned", "Purged performance sequence.");
    this.requestDraw();
  }

  // --- Coordinate Conversions ---
  private snapXToSnapGrid(pixelsX: number): number {
    const rawTicks = this.pixelsToTicks(pixelsX);
    const gridStep = this.midiEngine.snapTicks(rawTicks, "1/16");
    return this.ticksToPixels(gridStep);
  }

  private pixelsToTicks(px: number): number {
    // Offset standard scroll position first
    const clientX = px + this.viewScrollX;
    const beats = clientX / this.beatWidth;
    return beats * MIDI_PPQ;
  }

  private ticksToPixels(ticks: number): number {
    const beats = ticks / MIDI_PPQ;
    return (beats * this.beatWidth) - this.viewScrollX;
  }

  private pixelsToNoteIndex(py: number): number {
    const clientY = py + this.viewScrollY;
    const idx = Math.floor(clientY / this.noteHeight);
    return 127 - idx;
  }

  private noteIndexToPixels(midiIndex: number): number {
    const rowIdx = 127 - midiIndex;
    return (rowIdx * this.noteHeight) - this.viewScrollY;
  }

  // --- Mouse Actions on Grid ---
  onGridMouseDown(e: MouseEvent) {
    const bounds = this.gridCanvasRef.nativeElement.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    const midiNote = this.pixelsToNoteIndex(y);
    const tickTime = this.pixelsToTicks(x);

    // Filter clicked note check
    const existingNote = this.findNoteAtCoordinates(tickTime, midiNote);

    if (this.activeTool === "erase") {
      if (existingNote) {
        this.midiEngine.removeNote(existingNote.id);
      }
      return;
    }

    if (existingNote) {
      const isSelected = this.midiEngine.selectedNoteIds().has(existingNote.id);

      // Grab edge for resize
      const noteEndPx = this.ticksToPixels(existingNote.startTick + existingNote.lengthTick);
      const grabBufferPx = 6;
      if (Math.abs(x - noteEndPx) <= grabBufferPx) {
        this.dragMode = "resize-notes";
        this.resizeTargetNoteId = existingNote.id;
        this.dragStartTicks = tickTime;
        this.isDragging = true;
        return;
      }

      // Prepare Drag move
      this.dragMode = "move-notes";
      this.dragStartTicks = tickTime;
      this.dragStartNote = midiNote;
      this.isDragging = true;

      // Select clicked note if not selected
      if (!isSelected) {
        if (e.ctrlKey || e.shiftKey) {
          const s = this.midiEngine.selectedNoteIds();
          s.add(existingNote.id);
          this.midiEngine.selectedNoteIds.set(new Set(s));
        } else {
          this.midiEngine.selectedNoteIds.set(new Set([existingNote.id]));
        }
      }

      // Record states for moving arithmetic delta
      this.originNotesState = this.midiEngine.activeNotes
        .filter((n) => this.midiEngine.selectedNoteIds().has(n.id))
        .map((n) => ({ id: n.id, startTick: n.startTick, note: n.note }));

      // Live sound trigger
      this.instrument.triggerSynth(midiNote, existingNote.velocity, 0, 0.25);
      return;
    }

    // click on empty grid
    if (this.activeTool === "draw") {
      // Create new snapped note
      const snappedTickStart = this.midiEngine.snapTicks(tickTime, "1/16");
      const defaultLength = 240; // 1/16 step note

      const newNote: MidiNote = {
        id: "note_" + Math.random().toString(36).substr(2, 6),
        note: midiNote,
        velocity: this.midiEngine.defaultVelocity(),
        startTick: snappedTickStart,
        lengthTick: defaultLength,
        channel: midiNote < 36 ? 9 : 1, // trigger drums if lower octave or synth otherwise
      };

      this.midiEngine.addNote(newNote);
      this.midiEngine.selectedNoteIds.set(new Set([newNote.id]));

      // Immediate play feedback
      this.instrument.triggerSynth(midiNote, newNote.velocity, 0, 0.2);

      // Start drag resize immediately
      this.dragMode = "resize-notes";
      this.resizeTargetNoteId = newNote.id;
      this.dragStartTicks = tickTime;
      this.isDragging = true;
    } else {
      // Select box drag tool
      this.dragMode = "select-box";
      this.selectionBoxStart = { x, y };
      this.selectionBoxEnd = { x, y };
      this.isDragging = true;
      if (!e.ctrlKey && !e.shiftKey) {
        this.midiEngine.selectedNoteIds.set(new Set());
      }
    }
  }

  onGridMouseMove(e: MouseEvent) {
    const bounds = this.gridCanvasRef.nativeElement.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    const midiNote = this.pixelsToNoteIndex(y);
    const tickTime = this.pixelsToTicks(x);

    // Hover guidance details
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    this.activeHoverNoteName = `${names[midiNote % 12]}${Math.floor(midiNote/12)-1}`;

    if (!this.isDragging) return;

    if (this.dragMode === "resize-notes" && this.resizeTargetNoteId) {
      const note = this.midiEngine.activeNotes.find((n) => n.id === this.resizeTargetNoteId);
      if (note) {
        const snapCurrent = this.midiEngine.snapTicks(tickTime, "1/16");
        const newDuration = Math.max(120, snapCurrent - note.startTick); // minimum 32nd note duration
        this.midiEngine.updateNote(note.id, { lengthTick: newDuration });
      }
    } else if (this.dragMode === "move-notes") {
      const rawDeltaTicks = tickTime - this.dragStartTicks;
      const roundedDeltaTicks = this.midiEngine.snapTicks(rawDeltaTicks, "1/16");
      const deltaNotes = midiNote - this.dragStartNote;

      for (const origin of this.originNotesState) {
        let targStart = origin.startTick + roundedDeltaTicks;
        let targPitch = origin.note + deltaNotes;

        targStart = Math.max(0, targStart);
        targPitch = Math.max(12, Math.min(120, targPitch));

        if (this.midiEngine.lockToScale() && !this.midiEngine.isNoteInScale(targPitch)) {
          // Keep note on nearest scale-locked pitch
          targPitch = this.snapPitchToScale(targPitch);
        }

        this.midiEngine.updateNote(origin.id, {
          startTick: targStart,
          note: targPitch
        });
      }
    } else if (this.dragMode === "select-box") {
      this.selectionBoxEnd = { x, y };
      this.evaluateSelectionBox();
    }

    this.requestDraw();
  }

  onGridMouseUp(e?: MouseEvent) {
    if (e) {
      // template bound event bypass
    }
    this.isDragging = false;
    this.dragMode = "none";
    this.resizeTargetNoteId = null;
    this.originNotesState = [];
    this.requestDraw();
  }

  // --- Velocity interaction pane handlers ---
  onVelocityMouseDown(e: MouseEvent) {
    this.dragMode = "adjust-velocity";
    this.isDragging = true;
    this.evaluateVelocityEdit(e);
  }

  onVelocityMouseMove(e: MouseEvent) {
    if (this.isDragging && this.dragMode === "adjust-velocity") {
      this.evaluateVelocityEdit(e);
    }
  }

  onVelocityMouseUp(e?: MouseEvent) {
    if (e) {
      // template bound event bypass
    }
    this.isDragging = false;
    this.dragMode = "none";
  }

  private evaluateVelocityEdit(e: MouseEvent) {
    const bounds = this.velocityCanvasRef.nativeElement.getBoundingClientRect();
    const clickX = e.clientX - bounds.left;
    const clickY = e.clientY - bounds.top;

    // Convert pixel clickY position into standard MIDI velocity 0-127 index
    // Note: clickY = 0 is velocity 127, clickY = 112 is velocity 0
    const rawVal = 127 - Math.round((clickY / this.velocityHeight) * 127);
    const newVelocity = Math.max(1, Math.min(127, rawVal));

    // Find notes in horizontal span of click (give standard margin)
    const tickRange = this.pixelsToTicks(clickX);
    const toleranceTicks = (20 / this.beatWidth) * MIDI_PPQ; // 20px tolerance width

    const targetNotes = this.midiEngine.activeNotes.filter((n) => {
      // If notes are selected, we prioritize modifying selection velocities if in hover span
      const isNoteSelected = this.midiEngine.selectedNoteIds().has(n.id);
      const isXCovered = Math.abs(n.startTick - tickRange) <= toleranceTicks;
      return isXCovered || (isNoteSelected && Math.abs(n.startTick - tickRange) <= toleranceTicks * 3);
    });

    for (const note of targetNotes) {
      this.midiEngine.updateNote(note.id, { velocity: newVelocity });
      this.midiEngine.defaultVelocity.set(newVelocity);
    }
    this.requestDraw();
  }

  private snapPitchToScale(origPitch: number): number {
    for (let offset = 0; offset < 12; offset++) {
      if (this.midiEngine.isNoteInScale(origPitch + offset)) return origPitch + offset;
      if (this.midiEngine.isNoteInScale(origPitch - offset)) return origPitch - offset;
    }
    return origPitch;
  }

  private findNoteAtCoordinates(tickTime: number, midiNote: number): MidiNote | null {
    // Traverse active notes to see which note box overlaps coordinates
    for (const note of this.midiEngine.activeNotes) {
      if (note.note === midiNote) {
        if (tickTime >= note.startTick && tickTime <= note.startTick + note.lengthTick) {
          return note;
        }
      }
    }
    return null;
  }

  private evaluateSelectionBox() {
    const leftX = Math.min(this.selectionBoxStart.x, this.selectionBoxEnd.x);
    const rightX = Math.max(this.selectionBoxStart.x, this.selectionBoxEnd.x);
    const topY = Math.min(this.selectionBoxStart.y, this.selectionBoxEnd.y);
    const bottomY = Math.max(this.selectionBoxStart.y, this.selectionBoxEnd.y);

    const minTickRange = this.pixelsToTicks(leftX);
    const maxTickRange = this.pixelsToTicks(rightX);
    const maxNoteIdx = this.pixelsToNoteIndex(topY);
    const minNoteIdx = this.pixelsToNoteIndex(bottomY);

    const matchSet = new Set<string>();

    for (const note of this.midiEngine.activeNotes) {
      const overlapsX = note.startTick < maxTickRange && note.startTick + note.lengthTick > minTickRange;
      const overlapsY = note.note >= minNoteIdx && note.note <= maxNoteIdx;
      if (overlapsX && overlapsY) {
        matchSet.add(note.id);
      }
    }
    this.midiEngine.selectedNoteIds.set(matchSet);
  }

  // --- Rendering engine tick loop (Canvas-Optimized virtual render) ---
  private requestDraw() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.draw();
  }

  private startDrawLoop() {
    const loop = () => {
      this.drawPlayheadShadow();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private draw() {
    if (!this.gridCanvasRef || !this.velocityCanvasRef) return;
    this.drawMainGrid();
    this.drawVelocityChannels();
  }

  private drawMainGrid() {
    const canvas = this.gridCanvasRef.nativeElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. GRID LAYER
    // Draw horizontal row partitions matching white/black notes
    const startNoteIndex = this.pixelsToNoteIndex(0);
    const endNoteIndex = this.pixelsToNoteIndex(height);

    for (let noteIdx = startNoteIndex; noteIdx >= endNoteIndex; noteIdx--) {
      if (noteIdx < 0 || noteIdx > 127) continue;

      const isBlack = this.visibleKeys[127 - noteIdx]?.isBlack || false;
      const isScaleValid = this.midiEngine.isNoteInScale(noteIdx);
      const rowY = this.noteIndexToPixels(noteIdx);

      // Distinct, professional background coloring
      if (!isScaleValid && this.midiEngine.lockToScale()) {
        ctx.fillStyle = "#0c040e"; // darkened hue for out of scale rows
      } else {
        ctx.fillStyle = isBlack ? "#101017" : "#14141e";
      }

      ctx.fillRect(0, rowY, width, this.noteHeight);

      // Tiny separating lines
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = "#1b1b26/30";
      ctx.beginPath();
      ctx.moveTo(0, rowY + this.noteHeight);
      ctx.lineTo(width, rowY + this.noteHeight);
      ctx.stroke();

      // Ghost helper drawing for keys (if scale help enabled, outline with subtle dot)
      if (!isBlack && isScaleValid && this.midiEngine.showGhostNotes()) {
        ctx.fillStyle = "rgba(6, 182, 212, 0.05)";
        ctx.fillRect(0, rowY, width, this.noteHeight);
      }
    }

    // Draw vertical bar & beat lines
    ctx.lineWidth = 0.6;
    const startTick = this.pixelsToTicks(0);
    const endTick = this.pixelsToTicks(width);

    // Calculate nearest beat start
    const beatPPQ = MIDI_PPQ;
    const divisionPPQ = beatPPQ / 4; // 16th snaps

    const firstVisibleBeatIdx = Math.floor(startTick / beatPPQ);
    const lastVisibleBeatIdx = Math.ceil(endTick / beatPPQ);

    for (let beatIdx = firstVisibleBeatIdx; beatIdx <= lastVisibleBeatIdx; beatIdx++) {
      const beatTick = beatIdx * beatPPQ;
      const beatPx = this.ticksToPixels(beatTick);

      const isBarLine = beatIdx % 4 === 0;
      ctx.strokeStyle = isBarLine ? "#33334d" : "#22222f";
      ctx.lineWidth = isBarLine ? 1.0 : 0.6;

      ctx.beginPath();
      ctx.moveTo(beatPx, 0);
      ctx.lineTo(beatPx, height);
      ctx.stroke();

      // Draw sub-beat lines of zoomed-in spacing
      if (this.beatWidth >= 70) {
        ctx.lineWidth = 0.3;
        ctx.strokeStyle = "rgba(45, 45, 65, 0.35)";
        for (let subIdx = 1; subIdx < 4; subIdx++) {
          const subTick = beatTick + subIdx * divisionPPQ;
          const subPx = this.ticksToPixels(subTick);
          ctx.beginPath();
          ctx.setLineDash([2, 3]);
          ctx.moveTo(subPx, 0);
          ctx.lineTo(subPx, height);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // 2. NOTES LAYER
    const notes = this.midiEngine.activeNotes;
    const selected = this.midiEngine.selectedNoteIds();

    for (const note of notes) {
      const noteX = this.ticksToPixels(note.startTick);
      const noteY = this.noteIndexToPixels(note.note);
      const noteW = (note.lengthTick / MIDI_PPQ) * this.beatWidth;

      // Render only notes intersecting screen viewport boundaries
      if (noteX + noteW < 0 || noteX > width) continue;

      const isNoteSelected = selected.has(note.id);

      // Gorgeous stylized layout gradients
      if (isNoteSelected) {
        ctx.fillStyle = "#8b5cf6"; // magenta purple gradient feel
        ctx.strokeStyle = "#e9d5ff";
      } else {
        ctx.fillStyle = note.channel === 9 ? "#ec4899" : "#06b6d4"; // Cyan for Synth notes, Pink for drums!
        ctx.strokeStyle = note.channel === 9 ? "#fbcfe8" : "#a5f3fc";
      }

      // Rounded rect note block
      ctx.lineWidth = 1.0;
      this.drawRoundedRect(ctx, noteX + 1, noteY + 1.5, noteW - 2, this.noteHeight - 3, 3);
      ctx.fill();
      ctx.stroke();

      // Velocity indicator strip inside note
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(noteX + 1, noteY + this.noteHeight - 4, (note.velocity / 127) * (noteW - 2), 2);

      // Text name indicator
      if (noteW > 35) {
        ctx.fillStyle = isNoteSelected ? "#ffffff" : "rgba(0,0,0,0.72)";
        ctx.font = "bold 8px monospace";
        const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const label = `${names[note.note % 12]}${Math.floor(note.note/12)-1}`;
        ctx.fillText(label, noteX + 5, noteY + 10);
      }
    }

    // 3. SELECTION DRAG BOX
    if (this.dragMode === "select-box") {
      ctx.strokeStyle = "rgba(124, 58, 237, 0.65)";
      ctx.fillStyle = "rgba(124, 58, 237, 0.08)";
      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 4]);
      
      const leftX = Math.min(this.selectionBoxStart.x, this.selectionBoxEnd.x);
      const rightX = Math.max(this.selectionBoxStart.x, this.selectionBoxEnd.x);
      const topY = Math.min(this.selectionBoxStart.y, this.selectionBoxEnd.y);
      const bottomY = Math.max(this.selectionBoxStart.y, this.selectionBoxEnd.y);

      ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY);
      ctx.strokeRect(leftX, topY, rightX - leftX, bottomY - topY);
      ctx.setLineDash([]);
    }

    // 4. MASTER PLAYHEAD LAYER
    this.drawPlayhead(ctx, height);
  }

  private drawVelocityChannels() {
    const canvas = this.velocityCanvasRef.nativeElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Subtle horizontal helper guidelines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.25); ctx.lineTo(width, height * 0.25);
    ctx.moveTo(0, height * 5);    ctx.lineTo(width, height * 5);
    ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
    ctx.stroke();

    const notes = this.midiEngine.activeNotes;
    const selected = this.midiEngine.selectedNoteIds();

    for (const note of notes) {
      const stemX = this.ticksToPixels(note.startTick);
      if (stemX < 0 || stemX > width) continue;

      const isSelected = selected.has(note.id);
      const velY = height - (note.velocity / 127) * height;

      // Velocity stems
      ctx.strokeStyle = isSelected ? "#8b5cf6" : (note.channel === 9 ? "#ec4899" : "#06b6d4");
      ctx.lineWidth = 3.5;
      
      ctx.beginPath();
      ctx.moveTo(stemX, height);
      ctx.lineTo(stemX, velY);
      ctx.stroke();

      // Top dot caps
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(stemX, velY, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlayhead(ctx: CanvasRenderingContext2D, height: number) {
    const beats = this.project.playheadPosition();
    const ticks = beats * MIDI_PPQ;
    const x = this.ticksToPixels(ticks);

    if (x >= 0 && x <= ctx.canvas.width) {
      ctx.strokeStyle = "#eab308"; // Neon golden playhead!
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  private drawPlayheadShadow() {
    // Redraws the playhead frame quickly without updating buffers or deep layout structures
    if (!this.gridCanvasRef) return;
    this.drawMainGrid();
    this.drawVelocityChannels();
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    if (width <= 0 || height <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
