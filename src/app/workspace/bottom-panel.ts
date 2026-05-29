import {
  Component,
  inject,
  signal,
  computed,
  effect,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ProjectService, Track } from "../core/project.service";
import { AudioEngineService } from "../core/audio-engine.service";
import { WorkspaceService } from "../core/workspace.service";
import { HistoryService } from "../core/history.service";
import { PluginHostService } from "../core/plugins/plugin-host.service";
import { PluginType } from "../core/plugins/plugin-types";
import { PianoRollCanvasComponent } from "./midi/piano-roll-canvas";
import { InstrumentPanelComponent } from "./midi/instrument-panel";

@Component({
  selector: "app-bottom-panel",
  standalone: true,
  imports: [
    MatIconModule,
    CommonModule,
    PianoRollCanvasComponent,
    InstrumentPanelComponent,
  ],
  template: `
    <footer
      [style.height.px]="panelHeight()"
      class="bg-[#0b0b10] border-t border-[#1a1a24] flex flex-col shrink-0 select-none hidden lg:flex relative"
    >
      <!-- Horizontal resize tab wrapper handle -->
      <div
        (mousedown)="startHeightResize($event)"
        class="absolute -top-1 left-0 right-0 h-2 bg-transparent hover:bg-[#06b6d4]/40 hover:shadow-[0_0_8px_#06b6d47f] cursor-ns-resize z-50 transition-all duration-150"
        title="Drag up/down to adjust panel height"
      ></div>

      <!-- Panel Tabs -->
      <div
        class="flex items-center justify-between px-4 bg-[#121218] border-b border-[#1a1a24]"
      >
        <div class="flex gap-1 py-1">
          <button
            (click)="activeTab.set('editor')"
            class="px-4 py-1 text-[11px] font-bold rounded-sm border mr-0.5"
            [class]="
              activeTab() === 'editor'
                ? 'bg-[#232332] text-white border-[#333]'
                : 'text-[#666] border-transparent hover:text-[#a0a0b0]'
            "
          >
            1. DRUM SEQUENCER
          </button>
          <button
            (click)="activeTab.set('piano')"
            class="px-4 py-1 text-[11px] font-bold rounded-sm border mr-0.5"
            [class]="
              activeTab() === 'piano'
                ? 'bg-[#232332] text-white border-[#333]'
                : 'text-[#666] border-transparent hover:text-[#a0a0b0]'
            "
          >
            2. PIANO ROLL
          </button>
          <button
            (click)="activeTab.set('mixer')"
            class="px-4 py-1 text-[11px] font-bold rounded-sm border mr-0.5"
            [class]="
              activeTab() === 'mixer'
                ? 'bg-[#232332] text-white border-[#333]'
                : 'text-[#666] border-transparent hover:text-[#a0a0b0]'
            "
          >
            MIXER
          </button>
          <button
            (click)="activeTab.set('plugins')"
            class="px-4 py-1 text-[11px] font-bold rounded-sm border"
            [class]="
              activeTab() === 'plugins'
                ? 'bg-[#232332] text-white border-[#333]'
                : 'text-[#666] border-transparent hover:text-[#a0a0b0]'
            "
          >
            PLUGINS & FX
          </button>
        </div>

        <!-- Layout resizing helper info & controls -->
        <div class="flex items-center gap-3 text-[10px] font-mono text-gray-500 select-none">
          @if (activeTab() === 'editor') {
            <span class="text-[9px] text-[#06b6d4]/80 flex items-center gap-1 cursor-help" title="Hover over dividing columns to resize them horizontally">
              <mat-icon class="text-[11px] w-[11px] h-[11px]">drag_indicator</mat-icon>
              Resizing Active
            </span>
            <button
              type="button"
              (click)="resetWidths()"
              class="px-2 py-0.5 rounded border border-white/5 bg-[#171722] hover:bg-[#232332] hover:text-white text-[9px] cursor-pointer transition-all flex items-center gap-1"
              title="Reset column widths to 25% each"
            >
              <mat-icon class="text-[10px] w-3 h-3 text-[#b82bf2]">rotate_left</mat-icon>
              Reset Columns
            </button>
          }
          <div class="w-px h-3 bg-[#1a1a24]"></div>
          <span class="text-[9px] text-gray-400 flex items-center gap-1" title="Bottom panel height (Drag top edge of footer to resize)">
            <mat-icon class="text-[11px] w-[11px] h-[11px] text-[#06b6d4]">unfold_more</mat-icon>
            {{ panelHeight() }}px
          </span>
        </div>
      </div>

      <!-- Tab Contents -->
      <div class="flex-1 flex overflow-hidden">
        <!-- EDITOR TAB -->
        @if (activeTab() === "editor") {
          <!-- PAD BANK (Col 1) -->
          <div [style.width.%]="colWidths()[0]" class="shrink-0 border-r border-[#1a1a24] flex flex-col p-3 min-w-[200px] overflow-hidden">
            <div class="flex items-center justify-between mb-4">
              <button
                class="bg-[#232332] text-[#b82bf2] px-4 py-1 rounded text-[10px] font-bold tracking-widest border border-[#b82bf2]/30"
              >
                PAD BANK
              </button>
              <div class="flex gap-1.5 text-[10px] font-bold select-none text-[#a0a0b0]">
                <button
                  type="button"
                  (click)="activeBank.set('A')"
                  [class]="'px-2 py-0.5 rounded cursor-pointer transition-all duration-150 border-none font-bold text-[10px] ' + 
                           (activeBank() === 'A' ? 'text-[#06b6d4] bg-[#06b6d4]/10 shadow-[0_0_8px_#06b6d420]' : 'text-[#888899] hover:text-white hover:bg-white/5')"
                >
                  A
                </button>
                <button
                  type="button"
                  (click)="activeBank.set('B')"
                  [class]="'px-2 py-0.5 rounded cursor-pointer transition-all duration-150 border-none font-bold text-[10px] ' + 
                           (activeBank() === 'B' ? 'text-[#06b6d4] bg-[#06b6d4]/10 shadow-[0_0_8px_#06b6d420]' : 'text-[#888899] hover:text-white hover:bg-white/5')"
                >
                  B
                </button>
                <button
                  type="button"
                  (click)="activeBank.set('C')"
                  [class]="'px-2 py-0.5 rounded cursor-pointer transition-all duration-150 border-none font-bold text-[10px] ' + 
                           (activeBank() === 'C' ? 'text-[#06b6d4] bg-[#06b6d4]/10 shadow-[0_0_8px_#06b6d420]' : 'text-[#888899] hover:text-white hover:bg-white/5')"
                >
                  C
                </button>
                <button
                  type="button"
                  (click)="activeBank.set('D')"
                  [class]="'px-2 py-0.5 rounded cursor-pointer transition-all duration-150 border-none font-bold text-[10px] ' + 
                           (activeBank() === 'D' ? 'text-[#06b6d4] bg-[#06b6d4]/10 shadow-[0_0_8px_#06b6d420]' : 'text-[#888899] hover:text-white hover:bg-white/5')"
                >
                  D
                </button>
              </div>
            </div>
            <div
              class="grid grid-cols-4 grid-rows-4 gap-2 flex-1 w-full max-w-[240px] mx-auto"
            >
              @for (pad of currentPads(); track pad.id) {
                <div
                  class="rounded bg-[#121218] flex flex-col items-center justify-center p-1 cursor-pointer transition-colors"
                  [style.borderColor]="
                    activePad() === pad.id ? pad.color : pad.color + '50'
                  "
                  [style.borderWidth]="'1px'"
                  [style.borderStyle]="'solid'"
                  [style.backgroundColor]="
                    activePad() === pad.id ? pad.color + '40' : '#121218'
                  "
                  [style.boxShadow]="
                    activePad() === pad.id
                      ? '0 0 10px ' + pad.color + '40'
                      : 'none'
                  "
                  (mousedown)="playPad(pad)"
                >
                  <span
                    class="text-[9px] text-[#a0a0b0]"
                    [style.color]="activePad() === pad.id ? '#fff' : '#a0a0b0'"
                    >{{ pad.id }}</span
                  >
                  <span class="text-[10px]" [style.color]="pad.color">{{
                    pad.name
                  }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Column Resizer 1 -->
          <div
            (mousedown)="startColumnResize($event, 0)"
            class="w-1.5 hover:w-2 hover:bg-[#06b6d4]/40 hover:shadow-[0_0_8px_#06b6d47f] bg-transparent cursor-col-resize select-none h-full z-30 transition-all duration-150 shrink-0 self-stretch flex items-center justify-center group border-l border-r border-black/[0.15]"
            title="Drag horizontally to resize column; Double click to reset layout"
            (dblclick)="resetWidths()"
          >
            <div class="w-[2px] h-10 bg-white/[0.04] group-hover:bg-[#06b6d4] transition-colors rounded-full"></div>
          </div>

          <!-- WAVEFORM (Col 2) -->
          <div [style.width.%]="colWidths()[1]" class="shrink-0 border-r border-[#1a1a24] flex flex-col p-3 min-w-[200px] overflow-hidden">
            <div
              class="flex gap-4 mb-2 border-b border-[#1a1a24] pb-2 text-[10px] font-bold tracking-widest text-[#a0a0b0]"
            >
              <span
                class="text-[#06b6d4] border-b-2 border-[#06b6d4] pb-2 -mb-[10px]"
                >WAVEFORM</span
              >
              <span class="hover:text-white cursor-pointer">AUTOMATION</span>
            </div>
            <div class="flex-1 flex flex-col overflow-hidden">
              <div
                class="flex-1 rounded border border-[#b82bf2]/30 bg-[#b82bf2]/5 mb-3 flex items-center justify-center relative overflow-hidden cursor-pointer group"
                (click)="playActiveSample()"
                (keydown.enter)="playActiveSample()"
                (keydown.space)="playActiveSample()"
                tabindex="0"
                role="button"
                [attr.aria-label]="'Play active sample'"
              >
                <canvas
                  #waveformCanvas
                  class="absolute inset-0 w-full h-full opacity-80 group-active:scale-[0.98] transition-transform pointer-events-none"
                ></canvas>

                <div
                  class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 pointer-events-none"
                >
                  <mat-icon class="text-white w-[24px] h-[24px] text-[24px]"
                    >play_circle_outline</mat-icon
                  >
                </div>

                <div
                  class="absolute top-1 left-2 text-[10px] text-[#b82bf2] font-bold drop-shadow-md"
                >
                  {{ workspace.activeSample()?.name || "No sample" }}
                </div>

                <!-- Selection Box -->
                <div
                  class="absolute inset-y-0 border-l-[1.5px] border-r-[1.5px] border-white bg-white/5 pointer-events-none"
                  [style.left.%]="waveformStart() * 100"
                  [style.right.%]="(1 - waveformEnd()) * 100"
                >
                  <!-- Left Handle -->
                  <div
                    class="absolute inset-y-0 -left-2 w-4 cursor-ew-resize pointer-events-auto hover:bg-white/10 transition-colors"
                    (mousedown)="startWaveformDrag($event, 'start')"
                  ></div>
                  <div
                    class="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white -ml-[1.5px] pointer-events-none"
                  ></div>
                  <div
                    class="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white -ml-[1.5px] pointer-events-none"
                  ></div>

                  <!-- Right Handle -->
                  <div
                    class="absolute inset-y-0 -right-2 w-4 cursor-ew-resize pointer-events-auto hover:bg-white/10 transition-colors"
                    (mousedown)="startWaveformDrag($event, 'end')"
                  ></div>
                  <div
                    class="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white -mr-[1.5px] pointer-events-none"
                  ></div>
                  <div
                    class="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white -mr-[1.5px] pointer-events-none"
                  ></div>
                </div>

                <div
                  class="absolute bottom-1 w-full flex justify-center pointer-events-none"
                >
                  <div
                    class="w-3/4 h-6 bg-[#1a1a24] rounded-full flex items-center justify-center border border-[#b82bf2]/20"
                  >
                    <svg
                      preserveAspectRatio="none"
                      viewBox="0 0 100 10"
                      class="w-full h-full p-1 opacity-50"
                    >
                      <path
                        d="M0 5 Q10 1 20 5 T40 5 T60 5 T80 5 T100 5"
                        fill="none"
                        stroke="#b82bf2"
                        stroke-width="2"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Controls -->
              <div
                class="h-14 flex items-center justify-between text-[9px] text-[#a0a0b0] font-bold text-center gap-2"
              >
                <div class="flex flex-col items-center gap-1">
                  <span>FADE IN</span>
                  <div
                    class="w-6 h-6 rounded-full border border-[#b82bf2]/50 relative cursor-ns-resize"
                    (mousedown)="startFadeDrag($event)"
                  >
                    <div
                      class="w-0.5 h-3 bg-white absolute top-1 left-[11px] origin-bottom rounded pointer-events-none"
                      [style.transform]="
                        'rotate(' + (waveformFade() * 180 - 90) + 'deg)'
                      "
                    ></div>
                  </div>
                </div>
                <div class="flex flex-col items-center gap-1">
                  <span>PITCH</span>
                  <div
                    class="w-6 h-6 rounded-full border border-[#b82bf2]/50 relative cursor-ns-resize"
                    (mousedown)="startPitchDrag($event)"
                  >
                    <div
                      class="w-0.5 h-3 bg-white absolute top-1 left-[11px] origin-bottom rounded pointer-events-none"
                      [style.transform]="
                        'rotate(' + waveformPitch() * 135 + 'deg)'
                      "
                    ></div>
                  </div>
                </div>
                <div class="flex flex-col items-start gap-1 w-20">
                  <span>MODE</span>
                  <div
                    class="w-full px-2 py-1 bg-[#232332] rounded text-white mt-1 border border-[#333] flex justify-between items-center cursor-pointer"
                    (click)="toggleWaveformMode()"
                    (keydown.enter)="toggleWaveformMode()"
                    (keydown.space)="toggleWaveformMode()"
                    tabindex="0"
                    role="button"
                    [attr.aria-label]="
                      'Select waveform mode: ' + waveformMode()
                    "
                  >
                    <span class="truncate text-left w-full">{{
                      waveformMode()
                    }}</span>
                    <mat-icon class="text-[12px] w-[12px] h-[12px]"
                      >expand_more</mat-icon
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Column Resizer 2 -->
          <div
            (mousedown)="startColumnResize($event, 1)"
            class="w-1.5 hover:w-2 hover:bg-[#06b6d4]/40 hover:shadow-[0_0_8px_#06b6d47f] bg-transparent cursor-col-resize select-none h-full z-30 transition-all duration-150 shrink-0 self-stretch flex items-center justify-center group border-l border-r border-black/[0.15]"
            title="Drag horizontally to resize column; Double click to reset layout"
            (dblclick)="resetWidths()"
          >
            <div class="w-[2px] h-10 bg-white/[0.04] group-hover:bg-[#06b6d4] transition-colors rounded-full"></div>
          </div>

          <!-- SEQUENCE (Col 3) -->
          <div [style.width.%]="colWidths()[2]" class="shrink-0 border-r border-[#1a1a24] flex flex-col p-3 min-w-[200px] overflow-hidden">
            <div
              class="flex items-center justify-between mb-4 border-b border-[#1a1a24] pb-2"
            >
              <span
                class="text-[10px] text-[#06b6d4] font-bold tracking-widest border-b-2 border-[#06b6d4] pb-2 -mb-[10px]"
                >1. Drum Sequencer (Beats)</span
              >
              <button
                type="button"
                (click)="workspace.aiTrigger.set({ target: 'beats', defaultPrompt: 'Driving Tech House four-on-the-floor beat sequence with snappy hats' })"
                class="px-2 py-0.5 bg-gradient-to-r from-[#b82bf2] to-[#06b6d4] hover:brightness-110 text-white rounded text-[8.5px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer select-none border-none shadow-[0_0_8px_rgba(184,43,242,0.3)] transition-all"
                title="Generate custom drum beats with Gemini AI Co-Pilot"
              >
                <mat-icon class="text-[10px] w-2.5 h-2.5">auto_awesome</mat-icon>
                Gerar com IA
              </button>
            </div>

            <div class="flex-1 flex flex-col">
              <!-- Header Grid -->
              <div
                class="flex pl-16 text-[8px] font-mono text-[#666] mb-2 justify-between pr-2"
              >
                <span>1</span><span>2</span><span>3</span><span>4</span>
                <span class="text-white">1</span><span>2</span><span>3</span
                ><span>4</span>
              </div>
              <!-- Grid Matrix -->
              <div
                class="flex-1 flex flex-col justify-between mb-3 text-[10px] text-white"
              >
                @for (
                  row of project.sequence();
                  track row.instrument;
                  let r = $index
                ) {
                  <div class="flex items-center justify-between">
                    <div class="w-16 text-[#a0a0b0] font-medium truncate pr-2">
                      {{ row.instrument }}
                    </div>
                    <div class="flex-1 flex justify-between px-1 gap-[2px]">
                      @for (step of row.steps; track $index; let c = $index) {
                        <div
                          class="w-3 h-3 rounded-[1px] cursor-pointer"
                          [class.opacity-50]="
                            project.isPlaying() &&
                            project.currentStep() !== c &&
                            step
                          "
                          [class.opacity-100]="
                            project.isPlaying() &&
                            project.currentStep() === c &&
                            step
                          "
                          [style.backgroundColor]="
                            step
                              ? row.color
                              : project.currentStep() === c
                                ? '#333344'
                                : '#232332'
                          "
                          [style.boxShadow]="
                            step || project.currentStep() === c
                              ? '0 0 5px ' + row.color
                              : 'none'
                          "
                          [style.transform]="
                            project.currentStep() === c
                              ? 'scale(1.15)'
                              : 'scale(1)'
                          "
                          style="transition: all 0.05s ease-out;"
                          (click)="
                            project.toggleSequenceStep(r, c);
                            history.pushState()
                          "
                          (keydown.enter)="
                            project.toggleSequenceStep(r, c);
                            history.pushState()
                          "
                          (keydown.space)="
                            project.toggleSequenceStep(r, c);
                            history.pushState()
                          "
                          tabindex="0"
                          role="button"
                          [attr.aria-label]="'Toggle step ' + (c + 1)"
                        ></div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Column Resizer 3 -->
          <div
            (mousedown)="startColumnResize($event, 2)"
            class="w-1.5 hover:w-2 hover:bg-[#06b6d4]/40 hover:shadow-[0_0_8px_#06b6d47f] bg-transparent cursor-col-resize select-none h-full z-30 transition-all duration-150 shrink-0 self-stretch flex items-center justify-center group border-l border-r border-black/[0.15]"
            title="Drag horizontally to resize column; Double click to reset layout"
            (dblclick)="resetWidths()"
          >
            <div class="w-[2px] h-10 bg-white/[0.04] group-hover:bg-[#06b6d4] transition-colors rounded-full"></div>
          </div>

          <!-- CHANNEL FX (Col 4) -->
          <div
            [style.width.%]="colWidths()[3]"
            class="shrink-0 p-3 flex flex-col relative bg-[#09090e]/80 border-l border-[#1a1a24] min-w-[200px] overflow-hidden"
          >
            <div
              class="flex gap-4 mb-3 text-[10px] font-bold tracking-widest text-[#a0a0b0] border-b border-[#1a1a24] pb-2"
            >
              <span
                class="text-[#b82bf2] border-b-2 border-[#b82bf2] pb-2 -mb-[10px]"
                >CHANNEL STRIP</span
              >
            </div>

            <div
              class="flex-1 flex flex-col gap-3 pr-16 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-[#232332]"
            >
              <!-- EQ -->
              <div
                class="bg-[#121218] border border-[#1a1a24] rounded-md p-2 relative"
                [class.border-[#06b6d4]/40]="selectedTrack"
              >
                <div
                  class="flex justify-between items-center text-[10px] font-bold text-[#a0a0b0] mb-2"
                >
                  <div class="flex items-center gap-1.5 truncate">
                    <mat-icon
                      class="text-[14px] w-[14px] h-[14px] text-[#06b6d4]"
                      >tune</mat-icon
                    >
                    EQ:
                    <span class="text-white">{{
                      selectedTrack ? selectedTrack.name : "None"
                    }}</span>
                  </div>
                </div>
                <!-- 3-Band Parametric vertical-sliding slider box -->
                <div
                  class="h-14 border border-[#06b6d4]/20 rounded relative bg-black/40 overflow-hidden flex items-center justify-around select-none"
                >
                  <!-- LOW EQ -->
                  <div
                    class="flex flex-col items-center cursor-ns-resize h-full justify-center px-1 shrink-0 w-1/3 hover:bg-white/5 transition-colors"
                    (mousedown)="startEqDrag($event, 'low')"
                  >
                    <span
                      class="text-[8px] text-[#06b6d4] font-medium uppercase leading-tight"
                      >LOW</span
                    >
                    <span
                      class="text-[11px] font-mono font-bold text-white mt-0.5"
                    >
                      {{
                        selectedTrack
                          ? (selectedTrack.eqLow > 0 ? "+" : "") +
                            selectedTrack.eqLow.toFixed(1) +
                            " dB"
                          : "0.0 dB"
                      }}
                    </span>
                    <span class="text-[7px] text-[#555]">320 Hz</span>
                  </div>
                  <div class="w-px h-8 bg-[#1a1a24]"></div>
                  <!-- MID EQ -->
                  <div
                    class="flex flex-col items-center cursor-ns-resize h-full justify-center px-1 shrink-0 w-1/3 hover:bg-white/5 transition-colors"
                    (mousedown)="startEqDrag($event, 'mid')"
                  >
                    <span
                      class="text-[8px] text-[#10b981] font-medium uppercase leading-tight"
                      >MID</span
                    >
                    <span
                      class="text-[11px] font-mono font-bold text-white mt-0.5"
                    >
                      {{
                        selectedTrack
                          ? (selectedTrack.eqMid > 0 ? "+" : "") +
                            selectedTrack.eqMid.toFixed(1) +
                            " dB"
                          : "0.0 dB"
                      }}
                    </span>
                    <span class="text-[7px] text-[#555]">1.0 kHz</span>
                  </div>
                  <div class="w-px h-8 bg-[#1a1a24]"></div>
                  <!-- HIGH EQ -->
                  <div
                    class="flex flex-col items-center cursor-ns-resize h-full justify-center px-1 shrink-0 w-1/3 hover:bg-white/5 transition-colors"
                    (mousedown)="startEqDrag($event, 'high')"
                  >
                    <span
                      class="text-[8px] text-[#eab308] font-medium uppercase leading-tight"
                      >HIGH</span
                    >
                    <span
                      class="text-[11px] font-mono font-bold text-white mt-0.5"
                    >
                      {{
                        selectedTrack
                          ? (selectedTrack.eqHigh > 0 ? "+" : "") +
                            selectedTrack.eqHigh.toFixed(1) +
                            " dB"
                          : "0.0 dB"
                      }}
                    </span>
                    <span class="text-[7px] text-[#555]">3.2 kHz</span>
                  </div>
                </div>
              </div>

              <!-- Compressor -->
              <div
                class="bg-[#121218] border border-[#1a1a24] rounded-md p-2 flex flex-col"
                [class.border-[#b82bf2]/40]="selectedTrack"
              >
                <div
                  class="flex justify-between items-center text-[10px] font-bold text-[#a0a0b0] mb-1"
                >
                  <div
                    class="flex items-center gap-1.5 text-[#b82bf2] truncate"
                  >
                    <mat-icon class="text-[14px] w-[14px] h-[14px]"
                      >compress</mat-icon
                    >
                    COMPRESSOR
                  </div>
                  <span class="text-[7px] font-mono opacity-50"
                    >GAIN REDUCTION</span
                  >
                </div>
                <div class="flex justify-between items-end gap-1 mt-1">
                  <div
                    class="flex flex-col items-center hover:bg-white/5 p-1 rounded transition-colors cursor-ns-resize"
                    (mousedown)="startCompDrag($event, 'threshold')"
                  >
                    <div
                      class="w-6 h-6 rounded-full border border-[#b82bf2]/50 relative mb-1"
                    >
                      <div
                        class="w-0.5 h-3 bg-white absolute top-1 left-3 origin-bottom rounded pointer-events-none"
                        [style.transform]="
                          'rotate(' +
                          (selectedTrack ? selectedTrack.compThreshold : -18) *
                            3 +
                          'deg)'
                        "
                      ></div>
                    </div>
                    <span class="text-[8px] text-[#a0a0b0]">THRESH</span>
                    <span class="text-[9px] font-mono text-white mt-0.5">
                      {{
                        selectedTrack
                          ? selectedTrack.compThreshold.toFixed(0) + " dB"
                          : "-18 dB"
                      }}
                    </span>
                  </div>
                  <div
                    class="flex flex-col items-center hover:bg-white/5 p-1 rounded transition-colors cursor-ns-resize"
                    (mousedown)="startCompDrag($event, 'ratio')"
                  >
                    <div
                      class="w-6 h-6 rounded-full border border-[#b82bf2]/50 relative mb-1"
                    >
                      <div
                        class="w-0.5 h-3 bg-white absolute top-1 left-3 origin-bottom rounded pointer-events-none"
                        [style.transform]="
                          'rotate(' +
                          (selectedTrack ? selectedTrack.compRatio : 4) * 12 +
                          'deg)'
                        "
                      ></div>
                    </div>
                    <span class="text-[8px] text-[#a0a0b0]">RATIO</span>
                    <span class="text-[9px] font-mono text-white mt-0.5">
                      {{
                        selectedTrack
                          ? selectedTrack.compRatio.toFixed(1) + ":1"
                          : "4.0:1"
                      }}
                    </span>
                  </div>
                  <div
                    class="flex flex-col items-center p-1 rounded opacity-40"
                  >
                    <div
                      class="w-6 h-6 rounded-full border border-[#b82bf2]/30 relative mb-1"
                    >
                      <div
                        class="w-0.5 h-3 bg-white/70 absolute top-1 left-3 rotate-[-30deg] origin-bottom rounded"
                      ></div>
                    </div>
                    <span class="text-[8px] text-[#a0a0b0]">ATTACK</span>
                    <span class="text-[9px] font-mono text-white mt-0.5"
                      >10 ms</span
                    >
                  </div>
                  <div
                    class="flex flex-col items-center p-1 rounded opacity-40"
                  >
                    <div
                      class="w-6 h-6 rounded-full border border-[#b82bf2]/30 relative mb-1"
                    >
                      <div
                        class="w-0.5 h-3 bg-white/70 absolute top-1 left-3 rotate-[35deg] origin-bottom rounded"
                      ></div>
                    </div>
                    <span class="text-[8px] text-[#a0a0b0]">RELEASE</span>
                    <span class="text-[9px] font-mono text-white mt-0.5"
                      >100 ms</span
                    >
                  </div>
                  <div
                    class="w-1.5 h-12 bg-black rounded border border-[#232332] overflow-hidden flex flex-col justify-end"
                  >
                    <div
                      class="w-full bg-[#ec4899] transition-all duration-75"
                      [style.height.%]="
                        selectedTrack && project.isPlaying()
                          ? (Math.abs(
                              selectedTrack.eqLow + selectedTrack.eqHigh
                            ) /
                              24) *
                              70 +
                            5
                          : 0
                      "
                    ></div>
                  </div>
                </div>
              </div>

              <!-- Reverb -->
              <div
                class="bg-[#121218] border border-[#1a1a24] rounded-md p-2 flex justify-between items-center"
              >
                <div
                  class="flex items-center gap-1.5 text-[10px] font-bold text-[#a0a0b0]"
                >
                  <mat-icon class="text-[14px] w-[14px] h-[14px] text-[#10b981]"
                    >waves</mat-icon
                  >
                  ECO REVERB
                </div>
                <div
                  class="text-[8px] text-[#666] bg-[#0b0b10] px-2 py-0.5 rounded border border-[#1a1a24] text-center shrink-0 w-16"
                >
                  Feedback
                </div>
                <div class="flex items-center gap-2">
                  <div
                    class="flex flex-col items-center select-none text-right"
                  >
                    <div class="text-[7px] text-[#a0a0b0]">MIX</div>
                    <div class="text-[9px] text-white font-mono mt-0.5">
                      {{
                        selectedTrack
                          ? (selectedTrack.reverbMix * 100).toFixed(0) + "%"
                          : "15%"
                      }}
                    </div>
                  </div>
                  <div
                    class="w-5 h-5 rounded-full border border-[#b82bf2]/50 relative cursor-ns-resize"
                    (mousedown)="startReverbMixDrag($event)"
                  >
                    <div
                      class="w-0.5 h-2.5 bg-white absolute top-0.5 left-2 origin-bottom rounded pointer-events-none"
                      [style.transform]="
                        'rotate(' +
                        ((selectedTrack ? selectedTrack.reverbMix : 0.15) *
                          270 -
                          135) +
                        'deg)'
                      "
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Master VU Meter Absolute Right Edge -->
            <div
              class="absolute right-0 top-0 bottom-0 w-16 bg-[#121218] border-l border-[#1a1a24] p-2 flex flex-col"
            >
              <span
                class="text-[8px] font-bold tracking-widest text-[#a0a0b0] text-center mb-1"
                >MASTER</span
              >
              <div class="flex-1 flex gap-1 justify-center items-end py-1">
                <div
                  class="w-2 h-full bg-[#050505] rounded-sm flex flex-col justify-end overflow-hidden pb-1 gap-px relative"
                >
                  @for (v of vuValuesL(); track $index) {
                    <div
                      class="w-full h-1"
                      [class]="getVuClass(v, $index)"
                    ></div>
                  }
                </div>
                <div
                  class="w-2 h-full bg-[#050505] rounded-sm flex flex-col justify-end overflow-hidden pb-1 gap-px relative"
                >
                  @for (v of vuValuesR(); track $index) {
                    <div
                      class="w-full h-1"
                      [class]="getVuClass(v, $index)"
                    ></div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- MIXER TAB -->
        @if (activeTab() === "mixer") {
          <div
            class="flex-1 flex bg-[#0d0d12] overflow-x-auto p-4 gap-2 border-r border-[#1a1a24]"
          >
            @for (track of project.tracks(); track track.id) {
              <div
                (click)="workspace.selectedTrackId.set(track.id)"
                (keydown.enter)="workspace.selectedTrackId.set(track.id)"
                (keydown.space)="workspace.selectedTrackId.set(track.id)"
                tabindex="0"
                role="button"
                [attr.aria-label]="'Select track ' + track.name"
                class="w-24 rounded border flex flex-col p-2 items-center flex-shrink-0 relative shadow-sm cursor-pointer transition-all duration-200"
                [class]="
                  workspace.selectedTrackId() === track.id
                    ? 'bg-[#181824] border-[#06b6d4] shadow-[0_0_12px_rgba(6,182,212,0.15)] scale-[1.02]'
                    : 'bg-[#121218] border-[#1a1a24] hover:bg-[#151520]'
                "
              >
                <div
                  class="w-full pb-1 border-b border-[#1a1a24] mb-2 flex flex-col items-center"
                >
                  <div
                    class="w-1.5 h-1.5 rounded-full mb-1"
                    [style.backgroundColor]="track.color"
                  ></div>
                  <div
                    class="text-[10px] font-bold text-white/90 truncate w-full text-center"
                  >
                    {{ track.name }}
                  </div>
                </div>

                <!-- PAN -->
                <div
                  class="w-8 h-8 rounded-full border-[3px] border-[#161622] bg-[#1a1a24] relative mb-4 cursor-ns-resize"
                  (mousedown)="startPanDrag($event, track.id)"
                >
                  <div
                    class="w-[2px] h-3 bg-[#a0a0b0] absolute top-[2px] left-[13px] origin-bottom rounded-full pointer-events-none"
                    [style.transform]="'rotate(' + track.pan * 135 + 'deg)'"
                  ></div>
                </div>

                <div class="flex gap-2 mb-4 w-full justify-center">
                  <button
                    class="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shadow-inner border border-[#1a1a24]"
                    [class]="
                      track.mute
                        ? 'bg-red-500/20 border-red-500/50 text-red-500'
                        : 'bg-[#1a1a24] text-[#666] hover:bg-[#232332]'
                    "
                    (click)="
                      project.updateTrack(track.id, { mute: !track.mute })
                    "
                  >
                    M
                  </button>
                  <button
                    class="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shadow-inner border border-[#1a1a24]"
                    [class]="
                      track.solo
                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500'
                        : 'bg-[#1a1a24] text-[#666] hover:bg-[#232332]'
                    "
                    (click)="
                      project.updateTrack(track.id, { solo: !track.solo })
                    "
                  >
                    S
                  </button>
                </div>

                <!-- FADER -->
                <div
                  class="flex-1 w-full flex justify-center relative min-h-[100px] cursor-ns-resize group"
                  (mousedown)="startVolumeDrag($event, track.id)"
                >
                  <div
                    class="absolute inset-y-0 w-6 bg-[#050508] rounded z-0 mb-2"
                  ></div>
                  <div
                    class="w-[4px] h-full bg-[#111] rounded-full relative z-10 pointer-events-none mb-2"
                  >
                    <!-- Fill -->
                    <div
                      class="absolute bottom-0 left-0 w-full rounded-full"
                      [style.height.%]="track.volume * 100"
                      [style.backgroundColor]="track.color"
                    ></div>
                    <!-- Fader Cap -->
                    <div
                      class="absolute w-7 h-5 bg-gradient-to-b from-[#3a3a4a] to-[#2a2a35] border border-[#111] border-b-[#000] rounded shadow-[0_2px_4px_rgba(0,0,0,0.5)] left-1/2 -translate-x-1/2 transition-transform group-active:scale-95"
                      [style.bottom.%]="
                        Math.min(95, Math.max(0, track.volume * 100 - 5))
                      "
                    >
                      <div class="w-full h-[2px] bg-white/50 mt-[8px]"></div>
                    </div>
                  </div>
                </div>
              </div>
            }

            <!-- Master Bus inside Mixer -->
            <div
              class="ml-4 w-28 bg-[#111116] rounded border border-[#2a2a35] flex flex-col p-2 items-center flex-shrink-0 relative opacity-100 shadow-xl shadow-black/80"
            >
              <div
                class="text-[10px] font-bold text-white mb-2 truncate w-full text-center border-b border-[#2a2a35] pb-2"
              >
                MASTER
              </div>
              <div
                class="w-8 h-8 rounded-full border-[3px] border-[#161622] bg-[#1a1a24] relative mb-12 shadow-inner"
              >
                <div
                  class="w-[2px] h-3 bg-white absolute top-[2px] left-[13px] rotate-[0deg] origin-bottom rounded-full"
                ></div>
              </div>
              <!-- FADER & VU Combined -->
              <div
                class="flex-1 w-full flex justify-center gap-3 relative min-h-[100px] bg-[#050508] p-1 rounded border border-[#1a1a24]"
              >
                <div
                  class="text-[8px] font-mono text-[#444] absolute left-1 inset-y-2 flex flex-col justify-between items-end pr-1 text-right leading-none z-10 pointer-events-none"
                >
                  <span>0</span><span>-6</span><span>-12</span><span>-24</span>
                </div>
                <div
                  class="w-2.5 h-full bg-black rounded-sm relative overflow-hidden flex flex-col justify-end ml-4 shadow-inner"
                >
                  @for (v of vuValuesL(); track $index) {
                    <div
                      class="w-full h-[2px] mb-[1px] rounded-[1px]"
                      [class]="getVuClass(v, $index)"
                    ></div>
                  }
                </div>
                <div
                  class="w-2.5 h-full bg-black rounded-sm relative overflow-hidden flex flex-col justify-end shadow-inner"
                >
                  @for (v of vuValuesR(); track $index) {
                    <div
                      class="w-full h-[2px] mb-[1px] rounded-[1px]"
                      [class]="getVuClass(v, $index)"
                    ></div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- PIANO ROLL TAB -->
        @if (activeTab() === "piano") {
          <div
            class="flex-1 flex flex-col bg-[#08080c] min-h-0 overflow-hidden"
          >
            <!-- Sub tabs selectors for Piano edit modes -->
            <div
              class="h-9 bg-[#0b0b12] border-b border-[#1b1b26] flex items-center justify-between px-4 shrink-0"
            >
              <div class="flex gap-2">
                <button
                  (click)="activePianoSubTab.set('grid')"
                  [class.text-[#06b6d4]]="activePianoSubTab() === 'grid'"
                  [class.border-[#06b6d4]]="activePianoSubTab() === 'grid'"
                  [class.bg-[#12121b]]="activePianoSubTab() === 'grid'"
                  class="px-3 py-1 rounded-t border-t-2 border-l border-r border-[#1b1b26] bg-[#09090d]/30 text-xs font-bold text-neutral-400 hover:text-white cursor-pointer transition-all flex items-center gap-1.5 outline-none"
                >
                  <mat-icon class="text-[13px] w-[13px] h-[13px]"
                    >grid_on</mat-icon
                  >
                  Piano Roll Grid
                </button>
                <button
                  (click)="activePianoSubTab.set('rack')"
                  [class.text-[#f97316]]="activePianoSubTab() === 'rack'"
                  [class.border-[#f97316]]="activePianoSubTab() === 'rack'"
                  [class.bg-[#12121b]]="activePianoSubTab() === 'rack'"
                  class="px-3 py-1 rounded-t border-t-2 border-l border-r border-[#1b1b26] bg-[#09090d]/30 text-xs font-bold text-neutral-400 hover:text-white cursor-pointer transition-all flex items-center gap-1.5 outline-none"
                >
                  <mat-icon class="text-[13px] w-[13px] h-[13px]"
                    >graphic_eq</mat-icon
                  >
                  Instrument Rack & MPC
                </button>
              </div>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  (click)="workspace.aiTrigger.set({ target: 'melody', defaultPrompt: 'Chill Lo-fi Soul chords and lazy drum grooves in A Minor' })"
                  class="px-2.5 py-1 bg-gradient-to-r from-[#b82bf2] to-[#06b6d4] hover:brightness-110 text-white rounded text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer select-none border-none shadow-[0_0_8px_rgba(184,43,242,0.3)] transition-all"
                  title="Generate custom melodies/chord progressions with Gemini AI Co-Pilot"
                >
                  <mat-icon class="text-[11px] w-2.5 h-2.5">auto_awesome</mat-icon>
                  2. Gerar Melodia com IA
                </button>
                <span
                  class="text-[9px] font-mono text-zinc-500 font-bold tracking-widest uppercase hidden sm:inline"
                  >MPC CONSOLE INTEGRATED</span
                >
              </div>
            </div>

            <!-- Conditional Viewports -->
            <div class="flex-1 min-h-0">
              @if (activePianoSubTab() === "grid") {
                <app-piano-roll-canvas
                  class="h-full block"
                ></app-piano-roll-canvas>
              } @else {
                <app-instrument-panel
                  class="h-full block"
                ></app-instrument-panel>
              }
            </div>
          </div>
        }

        <!-- PLUGINS & FX TAB -->
        @if (activeTab() === "plugins") {
          <div
            class="flex-1 flex bg-[#0d0d12] overflow-x-auto p-4 gap-4 border-r border-[#1a1a24] scrollbar-thin scrollbar-thumb-[#232332]"
          >
            <!-- SYNTH PLUGIN (Static Instrument) -->
            <div
              class="min-w-[340px] max-w-[360px] h-full bg-[#161622] rounded-md border border-[#2a2a35] flex flex-col shadow-2xl relative overflow-hidden shrink-0"
            >
              <!-- Header -->
              <div
                class="h-8 bg-[#111118] border-b border-[#2a2a35] flex items-center justify-between px-3"
              >
                <div
                  class="flex items-center gap-2 text-white font-bold text-[10px] tracking-widest uppercase"
                >
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#b82bf2]"
                    >piano</mat-icon
                  >
                  INSTRUMENT: SYNTH
                </div>
                <div
                  class="text-[8px] text-[#a0a0b0] bg-[#0b0b10] px-2 py-0.5 rounded border border-[#1a1a24] cursor-pointer hover:bg-[#1a1a24]"
                >
                  PRESET: DEEP SAW
                  <mat-icon
                    class="text-[9px] w-[9px] h-[9px] inline align-middle"
                    >expand_more</mat-icon
                  >
                </div>
              </div>

              <!-- Synth Drum Body -->
              <div class="flex-1 p-3 flex flex-col gap-3">
                <div class="flex gap-3 h-[90px]">
                  <!-- OSC 1 -->
                  <div
                    class="flex-1 bg-[#0b0b10] rounded border border-[#1a1a24] p-2 flex flex-col justify-between"
                  >
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-[8px] font-bold text-[#b82bf2]"
                        >OSC 1</span
                      >
                      <button
                        class="text-[8px] text-[#aaa] hover:text-white uppercase font-bold px-1.5 py-0.5 rounded bg-black/40 hover:bg-black border border-[#1a1a24] cursor-pointer"
                        (click)="toggleSynthWave()"
                      >
                        {{ audio.synthWaveType }}
                      </button>
                    </div>
                    <div
                      class="flex-1 bg-[#161622] rounded relative overflow-hidden flex items-center justify-center border border-[#1a1a24] mb-1"
                    >
                      @if (audio.synthWaveType === "sawtooth") {
                        <svg
                          preserveAspectRatio="none"
                          viewBox="0 0 100 20"
                          class="w-full h-8 opacity-80"
                        >
                          <path
                            d="M0 15 L25 5 L25 15 L50 5 L50 15 L75 5 L75 15 L100 5 L100 15"
                            fill="none"
                            stroke="#b82bf2"
                            stroke-width="1.5"
                          ></path>
                        </svg>
                      } @else if (audio.synthWaveType === "sine") {
                        <svg
                          preserveAspectRatio="none"
                          viewBox="0 0 100 20"
                          class="w-full h-8 opacity-80"
                        >
                          <path
                            d="M0 10 Q12.5 0 25 10 T50 10 T75 10 T100 10"
                            fill="none"
                            stroke="#b82bf2"
                            stroke-width="1.5"
                          ></path>
                        </svg>
                      } @else if (audio.synthWaveType === "triangle") {
                        <svg
                          preserveAspectRatio="none"
                          viewBox="0 0 100 20"
                          class="w-full h-8 opacity-80"
                        >
                          <path
                            d="M0 15 L12.5 5 L25 15 L37.5 5 L50 15 L62.5 5 L75 15 L87.5 5 L100 15"
                            fill="none"
                            stroke="#b82bf2"
                            stroke-width="1.5"
                          ></path>
                        </svg>
                      } @else {
                        <svg
                          preserveAspectRatio="none"
                          viewBox="0 0 100 20"
                          class="w-full h-8 opacity-80"
                        >
                          <path
                            d="M0 15 L25 15 L25 5 L50 5 L50 15 L75 15 L75 5 L100 5"
                            fill="none"
                            stroke="#b82bf2"
                            stroke-width="1.5"
                          ></path>
                        </svg>
                      }
                    </div>
                    <div class="flex justify-between px-1">
                      <div
                        class="flex flex-col items-center hover:bg-white/5 rounded p-0.5 cursor-ns-resize"
                        (mousedown)="startSynthKnobDrag($event, 'octave')"
                      >
                        <div
                          class="w-4 h-4 rounded-full border border-[#444] relative flex items-center justify-center"
                        >
                          <div
                            class="w-0.5 h-1.5 bg-white origin-bottom rounded"
                            [style.transform]="
                              'rotate(' + audio.synthOctave * 35 + 'deg)'
                            "
                          ></div>
                        </div>
                        <span class="text-[7px] text-[#a0a0b0]">OCT</span>
                      </div>
                      <div class="flex flex-col items-center opacity-40">
                        <div
                          class="w-4 h-4 rounded-full border border-[#333] relative"
                        ></div>
                        <span class="text-[7px] text-[#666]">WT</span>
                      </div>
                      <div class="flex flex-col items-center opacity-40">
                        <div
                          class="w-4 h-4 rounded-full border border-[#333] relative"
                        ></div>
                        <span class="text-[7px] text-[#666]">VOL</span>
                      </div>
                    </div>
                  </div>

                  <!-- FILTER -->
                  <div
                    class="flex-1 bg-[#0b0b10] rounded border border-[#1a1a24] p-2 flex flex-col justify-between"
                  >
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-[8px] font-bold text-[#06b6d4]"
                        >LPF 24</span
                      >
                      <span class="text-[7px] text-[#666] font-mono"
                        >{{ audio.synthCutoff.toFixed(0) }}Hz</span
                      >
                    </div>
                    <div
                      class="flex-1 bg-[#161622] rounded relative overflow-hidden flex flex-col justify-end border border-[#1a1a24] mb-1"
                    >
                      <svg
                        preserveAspectRatio="none"
                        viewBox="0 0 100 30"
                        class="w-full h-8 opacity-80"
                      >
                        <path
                          d="M0 25 L40 25 Q60 25 70 5 Q75 25 100 25"
                          fill="none"
                          stroke="#06b6d4"
                          stroke-width="1.5"
                        ></path>
                      </svg>
                    </div>
                    <div class="flex justify-between px-1">
                      <div
                        class="flex flex-col items-center hover:bg-white/5 rounded p-0.5 cursor-ns-resize"
                        (mousedown)="startSynthKnobDrag($event, 'cutoff')"
                      >
                        <div
                          class="w-4 h-4 rounded-full border border-[#444] relative flex items-center justify-center"
                        >
                          <div
                            class="w-0.5 h-1.5 bg-white origin-bottom"
                            [style.transform]="
                              'rotate(' +
                              (((audio.synthCutoff - 200) / 7800) * 270 - 135) +
                              'deg)'
                            "
                          ></div>
                        </div>
                        <span class="text-[7px] text-[#a0a0b0]">CUTOFF</span>
                      </div>
                      <div
                        class="flex flex-col items-center hover:bg-white/5 rounded p-0.5 cursor-ns-resize"
                        (mousedown)="startSynthKnobDrag($event, 'resonance')"
                      >
                        <div
                          class="w-4 h-4 rounded-full border border-[#444] relative flex items-center justify-center"
                        >
                          <div
                            class="w-0.5 h-1.5 bg-white origin-bottom"
                            [style.transform]="
                              'rotate(' +
                              ((audio.synthResonance / 12) * 270 - 135) +
                              'deg)'
                            "
                          ></div>
                        </div>
                        <span class="text-[7px] text-[#a0a0b0]">RES</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- AMP ENVELOPE -->
                <div
                  class="bg-[#0b0b10] rounded border border-[#1a1a24] p-2 flex flex-col"
                >
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-[8px] font-bold text-[#eab308]"
                      >AMP ADSR</span
                    >
                    <span class="text-[7px] text-[#666] font-mono"
                      >A:{{ audio.synthAttack.toFixed(2) }}s R:{{
                        audio.synthRelease.toFixed(2)
                      }}s</span
                    >
                  </div>
                  <div
                    class="h-6 bg-[#161622] rounded border border-[#1a1a24] flex items-end"
                  >
                    <svg
                      preserveAspectRatio="none"
                      viewBox="0 0 100 30"
                      class="w-full h-full"
                    >
                      <path
                        [attr.d]="
                          'M0 30 L' +
                          (audio.synthAttack * 20 + 2) +
                          ' 4 L' +
                          (audio.synthAttack * 20 + 20) +
                          ' 15 L80 15 L100 30'
                        "
                        fill="#eab308"
                        fill-opacity="0.15"
                        stroke="#eab308"
                        stroke-width="1.5"
                      ></path>
                    </svg>
                  </div>
                  <div class="flex justify-around items-center mt-2 gap-2">
                    <div
                      class="flex items-center gap-1 hover:bg-white/5 px-1 rounded cursor-ns-resize"
                      (mousedown)="startSynthKnobDrag($event, 'attack')"
                    >
                      <div
                        class="w-3  h-3 rounded-full border border-[#eab308] relative"
                      ></div>
                      <span class="text-[7px] text-[#a0a0b0] uppercase"
                        >Attack</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-1 hover:bg-white/5 px-1 rounded cursor-ns-resize"
                      (mousedown)="startSynthKnobDrag($event, 'release')"
                    >
                      <div
                        class="w-3 h-3 rounded-full border border-[#eab308] relative"
                      ></div>
                      <span class="text-[7px] text-[#a0a0b0] uppercase"
                        >Release</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- DYNAMIC EFFECTS INSERTS RACK -->
            @if (!selectedTrack) {
              <div
                class="flex-1 flex flex-col items-center justify-center text-center px-8 border border-dashed border-[#1a1a24] rounded-md bg-[#0b0b0f] select-none text-[#666]"
              >
                <mat-icon class="text-[32px] w-[32px] h-[32px] mb-2 text-[#444]"
                  >hearing</mat-icon
                >
                <span
                  class="text-[12px] font-bold tracking-widest text-white/50 uppercase"
                  >Channel effects offline</span
                >
                <span class="text-[10px] text-gray-400 max-w-[200px] mt-1"
                  >Select any track in the arranger or mixer to configure its dedicated device insert chains</span
                >
              </div>
            } @else {
              <!-- Map through dynamic custom plugins loaded on the track -->
              @for (plugin of pluginHost.trackFxChains().get(selectedTrack.id)?.plugins || []; track plugin.id; let idx = $index; let total = $count) {
                <div
                  [id]="'plugin-card-' + plugin.id"
                  class="w-[195px] h-full rounded-md flex flex-col shrink-0 overflow-hidden border transition-all"
                  [class]="plugin.bypass ? 'bg-[#0e0e14] border-[#1d1d26] opacity-60' : 'bg-[#111116] border-[#2a2a38]'"
                >
                  <!-- Header bar -->
                  <div
                    class="h-7 border-b flex items-center justify-between px-2"
                    [class]="plugin.bypass ? 'bg-[#121218] border-[#1d1d26]' : 'bg-[#181822] border-[#2a2a38]'"
                  >
                    <div class="flex items-center gap-1.5 text-white font-bold text-[9px] tracking-widest uppercase truncate max-w-[125px]">
                      <mat-icon class="text-[11px] w-[11px] h-[11px]" [class]="plugin.category === 'midi-fx' ? 'text-amber-500' : 'text-cyan-400'">
                        {{ plugin.category === 'midi-fx' ? 'album' : 'graphic_eq' }}
                      </mat-icon>
                      <span class="truncate">{{ plugin.name }}</span>
                    </div>

                    <div class="flex items-center gap-1">
                      <!-- Float Detach Btn -->
                      <button
                        type="button"
                        (click)="pluginHost.detachPlugin(selectedTrack.id, plugin.id)"
                        class="text-gray-500 hover:text-[#06b6d4] p-0.5 rounded cursor-pointer flex items-center justify-center transition-colors"
                        title="Detach and Float Device Editor"
                      >
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">open_in_new</mat-icon>
                      </button>

                      <!-- Bypass Toggle btn -->
                      <button
                        (click)="onToggleBypass(selectedTrack.id, plugin.id)"
                        [class]="plugin.bypass ? 'text-[#555] hover:text-white' : 'text-[#06b6d4]'"
                        title="Bypass plugin"
                        class="p-0.5 rounded hover:bg-white/5 flex items-center justify-center cursor-pointer"
                      >
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">power_settings_new</mat-icon>
                      </button>

                      <!-- Shift Sequence (Left) -->
                      <button
                        (click)="onMovePlugin(selectedTrack.id, idx, -1)"
                        [disabled]="idx === 0"
                        class="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 p-0.5 rounded cursor-pointer"
                        title="Move Device Left"
                      >
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">arrow_back</mat-icon>
                      </button>

                      <!-- Shift Sequence (Right) -->
                      <button
                        (click)="onMovePlugin(selectedTrack.id, idx, 1)"
                        [disabled]="idx === total - 1"
                        class="text-gray-500 hover:text-white disabled:opacity-30 disabled:hover:text-gray-500 p-0.5 rounded cursor-pointer"
                        title="Move Device Right"
                      >
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">arrow_forward</mat-icon>
                      </button>

                      <!-- Delete slot btn -->
                      <button
                        (click)="onRemovePlugin(selectedTrack.id, plugin.id)"
                        class="text-red-400/80 hover:text-red-400 p-0.5 rounded hover:bg-white/5 flex items-center justify-center cursor-pointer"
                        title="Delete Device"
                      >
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">delete</mat-icon>
                      </button>
                    </div>
                  </div>

                  <!-- Custom visual graphs (EQ band, slider rack) -->
                  <div class="flex-1 p-2 flex flex-col justify-between overflow-hidden relative">
                    @if (isDetached(plugin.id)) {
                      <div class="absolute inset-0 bg-[#0a0a0f]/95 z-20 flex flex-col items-center justify-center p-2 text-center select-none">
                        <mat-icon class="text-[#06b6d4]/80 text-[18px] w-[18px] h-[18px] mb-1.5 leading-none animate-pulse">open_in_new</mat-icon>
                        <span class="text-[8px] font-bold text-gray-200 tracking-wider uppercase leading-none">FLOAT ACTIVE</span>
                        <span class="text-[7px] text-gray-500 mt-1 mb-2.5 leading-tight">Editor is detached</span>
                        
                        <div class="flex gap-1.5 w-full justify-center">
                          <button
                            type="button"
                            (click)="pluginHost.bringToFront(plugin.id)"
                            class="text-[7px] px-1.5 py-0.5 border border-[#06b6d4]/30 bg-[#06b6d4]/5 hover:bg-[#06b6d4]/10 hover:text-white transition rounded font-semibold cursor-pointer"
                          >
                            Bring Front
                          </button>
                          <button
                            type="button"
                            (click)="pluginHost.dockPlugin(plugin.id)"
                            class="text-[7px] px-1.5 py-0.5 border border-white/5 bg-[#1a1a24] hover:border-white/20 hover:text-white transition rounded font-semibold cursor-pointer"
                          >
                            Dock Back
                          </button>
                        </div>
                      </div>
                    }

                    <div class="mb-1.5 bg-black/40 rounded border border-[#1a1a24] p-1 text-[8px] flex items-center justify-between">
                      <span class="text-gray-550 font-bold tracking-wider">PATCH</span>
                      <select
                        (change)="onLoadPreset(selectedTrack.id, plugin.id, $any($event.target).value)"
                        class="bg-[#0b0b10] text-[8px] text-gray-300 px-1 py-0.5 rounded border border-[#10b981]/20 cursor-pointer hover:bg-[#1a1a24] outline-none"
                      >
                        <option value="" disabled selected>DEFAULT PRESET</option>
                        @for (p of getPresets(plugin.type); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </div>

                    <!-- Param slider loops -->
                    <div class="flex-1 overflow-y-auto pr-0.5 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
                      @for (p of plugin.parameters; track p.id) {
                        <div class="flex flex-col">
                          <div class="flex justify-between items-center text-[8px] font-mono text-gray-400 leading-none mb-1">
                            <span class="truncate pr-1 uppercase text-gray-450">{{ p.name }}</span>
                            <span class="text-[#06b6d4] font-semibold">{{ p.value.toFixed(p.id === 'attack' || p.id === 'release' || p.id === 'time' ? 3 : 1) }}{{ p.unit }}</span>
                          </div>
                          
                          <input
                            type="range"
                            [min]="p.min"
                            [max]="p.max"
                            [step]="p.id === 'attack' || p.id === 'release' || p.id === 'time' ? 0.005 : p.id === 'ratio' ? 0.5 : 1"
                            [value]="p.value"
                            (input)="onParamChange(selectedTrack.id, plugin.id, p.id, $any($event.target).value)"
                            class="w-full h-1 bg-black rounded appearance-none cursor-pointer accent-[#06b6d4] focus:outline-none"
                          />
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }

              <!-- ADD EXTRA DYNAMIC SLOT -->
              <div class="relative group shrink-0 w-[125px] h-full rounded-md border border-dashed border-[#23232f] bg-[#09090e]/60 flex flex-col items-center justify-center p-2 text-center transition-all cursor-pointer hover:bg-[#111118] hover:border-[#10b981]/50">
                <mat-icon class="text-[22px] w-[22px] h-[22px] text-gray-500 mb-1 leading-none group-hover:text-[#10b981]">add_circle_outline</mat-icon>
                <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest line-clamp-2 leading-tight group-hover:text-white">Add FX & MIDI <br>Devices</span>
                
                <!-- Droplist selections hover overlay -->
                <div class="absolute inset-0 bg-black/95 rounded-md p-2 hidden group-hover:block transition-all z-20 overflow-y-auto text-left border border-[#10b981]/30 scrollbar-thin">
                  <div class="text-[7px] text-gray-500 uppercase tracking-widest font-extrabold mb-1">Audio FX Modules</div>
                  <div class="flex flex-col gap-1 mb-2">
                    <button (click)="onAddPlugin(selectedTrack.id, 'eq')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Parametric EQ</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'compressor')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Studio G-Comp</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'reverb')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Space Reverb</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'delay')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Tape Echo Delay</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'distortion')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Tube Saturator</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'chorus')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Chorus Shimmer</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'phaser')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Sweeper Phaser</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'limiter')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-cyan-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Brickwall Limiter</button>
                  </div>

                  <div class="text-[7px] text-gray-500 uppercase tracking-widest font-extrabold mb-1">MIDI Helper FX</div>
                  <div class="flex flex-col gap-1">
                    <button (click)="onAddPlugin(selectedTrack.id, 'arpeggiator')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-amber-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Arpeggiator</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'chord-gen')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-amber-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Chord Gen</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'scale-lock')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-amber-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Scale Lock</button>
                    <button (click)="onAddPlugin(selectedTrack.id, 'humanizer')" class="text-[8px] text-gray-300 hover:text-white bg-[#111] hover:bg-amber-500/20 px-1.5 py-1 rounded text-left border border-white/5 cursor-pointer">Human Jitter</button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </footer>
  `,
  styles: [
    `
      .custom-grid-bg {
        background-color: #121218;
      }
    `,
  ],
})
export class BottomPanelComponent implements OnDestroy {
  project = inject(ProjectService);
  audio = inject(AudioEngineService);
  workspace = inject(WorkspaceService);
  history = inject(HistoryService);
  pluginHost = inject(PluginHostService);
  Math = Math;

  get selectedTrack(): Track | undefined {
    return this.project
      .tracks()
      .find((t) => t.id === this.workspace.selectedTrackId());
  }

  updateSelectedTrack(partial: Partial<Track>) {
    const track = this.selectedTrack;
    if (track) {
      this.project.updateTrack(track.id, partial);
    }
  }

  isDetached(pluginId: string): boolean {
    return this.pluginHost.floatingPlugins().some((fp) => fp.pluginId === pluginId);
  }

  onParamChange(trackId: string, pluginId: string, paramId: string, valStr: string) {
    const val = parseFloat(valStr);
    this.pluginHost.updatePluginParameter(trackId, pluginId, paramId, val);
  }

  getPresets(type: PluginType) {
    return this.pluginHost.getFactoryPresetsForType(type);
  }

  onLoadPreset(trackId: string, pluginId: string, presetId: string) {
    const list = this.pluginHost.getFactoryPresetsForType(this.pluginHost.trackFxChains().get(trackId)?.plugins.find(p => p.id === pluginId)?.type || 'eq');
    const preset = list.find(p => p.id === presetId);
    if (preset) {
      this.pluginHost.applyPresetToPlugin(trackId, pluginId, preset);
    }
  }

  onAddPlugin(trackId: string, typeStr: PluginType) {
    this.pluginHost.addPluginToTrack(trackId, typeStr);
  }

  onRemovePlugin(trackId: string, pluginId: string) {
    this.pluginHost.removePluginFromTrack(trackId, pluginId);
  }

  onToggleBypass(trackId: string, pluginId: string) {
    this.pluginHost.togglePluginBypass(trackId, pluginId);
  }

  onMovePlugin(trackId: string, fromIdx: number, dir: number) {
    const toIdx = fromIdx + dir;
    const limit = this.pluginHost.trackFxChains().get(trackId)?.plugins.length || 0;
    if (toIdx >= 0 && toIdx < limit) {
      this.pluginHost.movePluginInTrack(trackId, fromIdx, toIdx);
    }
  }

  vuValuesL = signal<number[]>(Array(24).fill(0));
  vuValuesR = signal<number[]>(Array(24).fill(0));
  private animFrame: number | null = null;

  activePad = signal<number | null>(null);
  activeTab = signal<"editor" | "mixer" | "piano" | "plugins">("editor");

  colWidths = signal<number[]>((() => {
    try {
      const saved = localStorage.getItem("workspace_col_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) {
          return parsed;
        }
      }
    } catch {
      void 0;
    }
    return [25, 25, 25, 25];
  })());

  panelHeight = signal<number>((() => {
    try {
      const saved = localStorage.getItem("workspace_panel_height");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) {
          return parsed;
        }
      }
    } catch {
      void 0;
    }
    return 280;
  })());

  resetWidths() {
    this.colWidths.set([25, 25, 25, 25]);
    try {
      localStorage.setItem("workspace_col_widths", JSON.stringify([25, 25, 25, 25]));
    } catch {
      void 0;
    }
    this.workspace.showToast("Layout Reset", "Column widths restored to default 25% distribution.");
  }

  startColumnResize(e: MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidths = [...this.colWidths()];
    const panelWidth = document.querySelector('app-bottom-panel')?.getBoundingClientRect().width || window.innerWidth;

    const onMouseMove = (moveEv: MouseEvent) => {
      const dX = moveEv.clientX - startX;
      const dPct = (dX / panelWidth) * 100;

      const newWidths = [...startWidths];
      const val1 = startWidths[index] + dPct;
      const val2 = startWidths[index + 1] - dPct;

      // Ensure min col size of 15% and max of 55%
      if (val1 >= 15 && val1 <= 55 && val2 >= 15 && val2 <= 55) {
        newWidths[index] = val1;
        newWidths[index + 1] = val2;
        this.colWidths.set(newWidths);
        try {
          localStorage.setItem("workspace_col_widths", JSON.stringify(newWidths));
        } catch {
          void 0;
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      this.history.pushState();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  startHeightResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = this.panelHeight();

    const onMouseMove = (moveEv: MouseEvent) => {
      const dY = moveEv.clientY - startY;
      const newHeight = Math.max(150, Math.min(650, startHeight - dY));
      this.panelHeight.set(newHeight);
      try {
        localStorage.setItem("workspace_panel_height", String(newHeight));
      } catch {
        void 0;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      this.history.pushState();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  activePianoSubTab = signal<"grid" | "rack">("grid");
  activePianoTool = signal<"edit" | "brush" | "cut">("edit");

  waveformFade = signal<number>(0);
  waveformPitch = signal<number>(0);
  waveformMode = signal<"Complex" | "Beats" | "Tones" | "Texture">("Complex");
  waveformStart = signal<number>(0.2);
  waveformEnd = signal<number>(0.8);

  @ViewChild("waveformCanvas") canvasRef?: ElementRef<HTMLCanvasElement>;

  activePianoDropdown = signal<"grid" | null>(null);

  togglePianoDropdown(type: "grid", e: MouseEvent) {
    e.stopPropagation();
    this.activePianoDropdown.set(
      this.activePianoDropdown() === type ? null : type,
    );
  }

  setPianoGridSize(size: "1/4" | "1/8" | "1/16" | "1/32" | "Off") {
    this.workspace.gridSize.set(size);
    this.activePianoDropdown.set(null);
  }

  getPianoGridStepPx(): number {
    const size = this.workspace.gridSize();
    if (size === "1/4") return 128;
    if (size === "1/8") return 64;
    if (size === "1/16") return 32;
    if (size === "1/32") return 16;
    return 32; // Default size placeholder
  }

  @HostListener("document:click")
  closePianoDropdowns() {
    this.activePianoDropdown.set(null);
  }

  @HostListener("window:keydown", ["$event"])
  onPadKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.activeTab() !== "editor") return;
    if (e.repeat) return;

    // Map typewriter keys to MPC 4x4 pad indices:
    // Row 1 keys: 1, 2, 3, 4 -> Pads 13, 14, 15, 16
    // Row 2 keys: q, w, e, r -> Pads 9, 10, 11, 12
    // Row 3 keys: a, s, d, f -> Pads 5, 6, 7, 8
    // Row 4 keys: z, x, c, v -> Pads 1, 2, 3, 4
    const keyToPadId: Record<string, number> = {
      "1": 13, "2": 14, "3": 15, "4": 16,
      "q": 9, "w": 10, "e": 11, "r": 12,
      "a": 5, "s": 6, "d": 7, "f": 8,
      "z": 1, "x": 2, "c": 3, "v": 4
    };

    const padId = keyToPadId[e.key.toLowerCase()];
    if (padId !== undefined) {
      const pad = this.currentPads().find(p => p.id === padId);
      if (pad) {
        e.preventDefault();
        this.playPad(pad);
      }
    }
  }

  pianoKeys = [
    "C4",
    "B3",
    "A#3",
    "A3",
    "G#3",
    "G3",
    "F#3",
    "F3",
    "E3",
    "D#3",
    "D3",
    "C#3",
    "C3",
  ];

  get pianoNotes() {
    return this.workspace.pianoNotes;
  }

  onPianoGridClick(e: MouseEvent) {
    if (
      this.activePianoTool() === "edit" ||
      this.activePianoTool() === "brush"
    ) {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Snap to grid based on global grid size selection
      const size = this.workspace.gridSize();
      let gridStep = 32; // Default 1/16 is 32px
      if (size === "1/4") gridStep = 128;
      else if (size === "1/8") gridStep = 64;
      else if (size === "1/16") gridStep = 32;
      else if (size === "1/32") gridStep = 16;
      else if (size === "Off") gridStep = 1; // Unsnapped

      const snappedX = gridStep > 1 ? Math.floor(x / gridStep) * gridStep : x;
      const snappedY = Math.floor(y / 24) * 24;

      this.pianoNotes.update((notes) => [
        ...notes,
        {
          id: "n" + Date.now(),
          x: snappedX,
          y: snappedY,
          w: gridStep > 1 ? gridStep : 32, // Default note size of 32px if Off
          h: 24,
        },
      ]);
      this.history.pushState();
    }
  }

  removePianoNote(id: string) {
    if (this.activePianoTool() === "cut") {
      this.pianoNotes.update((notes) => notes.filter((n) => n.id !== id));
      this.history.pushState();
    }
  }

  playActiveSample() {
    const sample = this.workspace.activeSample();
    if (sample) {
      this.audio.playOneShot(sample.name, sample.url, {
        pitch: this.waveformPitch(),
        start: this.waveformStart(),
        end: this.waveformEnd(),
        fade: this.waveformFade(),
      });
    }
  }

  // Dragging state
  private activeDragTrackId: string | null = null;
  private dragType:
    | "volume"
    | "pan"
    | "fade"
    | "pitch"
    | "waveStart"
    | "waveEnd"
    | "eqLow"
    | "eqMid"
    | "eqHigh"
    | "compThreshold"
    | "compRatio"
    | "reverbMix"
    | "filterCutoff"
    | "filterReso"
    | "distortionDrive"
    | "distortionMix"
    | "chorusRate"
    | "chorusDepth"
    | "chorusMix"
    | "delayTime"
    | "delayFeedback"
    | "delayMix"
    | "reverbDecay"
    | "synthCutoff"
    | "synthResonance"
    | "synthOctave"
    | "synthAttack"
    | "synthRelease"
    | null = null;
  private startY = 0;
  private startX = 0;
  private startVal = 0;

  @HostListener("window:mousemove", ["$event"])
  onMouseMove(e: MouseEvent) {
    if (!this.dragType) return;

    // We adjust based on vertical drag. Up = increase.
    const deltaY = this.startY - e.clientY;

    if (this.dragType === "volume" && this.activeDragTrackId) {
      const deltaVol = deltaY * 0.005;
      const newVol = Math.max(0, Math.min(1.0, this.startVal + deltaVol));
      this.project.updateTrack(this.activeDragTrackId, { volume: newVol });
    } else if (this.dragType === "pan" && this.activeDragTrackId) {
      const deltaPan = deltaY * 0.01;
      const newPan = Math.max(-1.0, Math.min(1.0, this.startVal + deltaPan));
      this.project.updateTrack(this.activeDragTrackId, { pan: newPan });
    } else if (this.dragType === "fade") {
      const newFade = Math.max(0, Math.min(1.0, this.startVal + deltaY * 0.01));
      this.waveformFade.set(newFade);
    } else if (this.dragType === "pitch") {
      const newPitch = Math.max(
        -1.0,
        Math.min(1.0, this.startVal + deltaY * 0.01),
      );
      this.waveformPitch.set(newPitch);
    } else if (this.dragType === "waveStart") {
      const deltaX = e.clientX - this.startX;
      const movePct = deltaX * 0.003;
      const newStart = Math.max(
        0,
        Math.min(this.waveformEnd() - 0.02, this.startVal + movePct),
      );
      this.waveformStart.set(newStart);
    } else if (this.dragType === "waveEnd") {
      const deltaX = e.clientX - this.startX;
      const movePct = deltaX * 0.003;
      const newEnd = Math.max(
        this.waveformStart() + 0.02,
        Math.min(1.0, this.startVal + movePct),
      );
      this.waveformEnd.set(newEnd);
    } else if (this.dragType === "eqLow") {
      const newVal = Math.max(
        -12.0,
        Math.min(12.0, this.startVal + deltaY * 0.15),
      );
      this.updateSelectedTrack({ eqLow: newVal });
    } else if (this.dragType === "eqMid") {
      const newVal = Math.max(
        -12.0,
        Math.min(12.0, this.startVal + deltaY * 0.15),
      );
      this.updateSelectedTrack({ eqMid: newVal });
    } else if (this.dragType === "eqHigh") {
      const newVal = Math.max(
        -12.0,
        Math.min(12.0, this.startVal + deltaY * 0.15),
      );
      this.updateSelectedTrack({ eqHigh: newVal });
    } else if (this.dragType === "compThreshold") {
      const newVal = Math.max(
        -60.0,
        Math.min(0.0, this.startVal + deltaY * 0.5),
      );
      this.updateSelectedTrack({ compThreshold: newVal });
    } else if (this.dragType === "compRatio") {
      const newVal = Math.max(
        1.0,
        Math.min(20.0, this.startVal + deltaY * 0.15),
      );
      this.updateSelectedTrack({ compRatio: newVal });
    } else if (this.dragType === "reverbMix") {
      const newVal = Math.max(
        0.0,
        Math.min(0.95, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ reverbMix: newVal });
    } else if (this.dragType === "filterCutoff") {
      const newVal = Math.max(20, Math.min(20000, this.startVal + deltaY * 45));
      this.updateSelectedTrack({ filterCutoff: newVal });
    } else if (this.dragType === "filterReso") {
      const newVal = Math.max(
        0.1,
        Math.min(15.0, this.startVal + deltaY * 0.05),
      );
      this.updateSelectedTrack({ filterReso: newVal });
    } else if (this.dragType === "distortionDrive") {
      const newVal = Math.max(
        0,
        Math.min(100, Math.round(this.startVal + deltaY * 0.5)),
      );
      this.updateSelectedTrack({ distortionDrive: newVal });
    } else if (this.dragType === "distortionMix") {
      const newVal = Math.max(
        0.0,
        Math.min(1.0, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ distortionMix: newVal });
    } else if (this.dragType === "chorusRate") {
      const newVal = Math.max(
        0.1,
        Math.min(10.0, this.startVal + deltaY * 0.025),
      );
      this.updateSelectedTrack({ chorusRate: newVal });
    } else if (this.dragType === "chorusDepth") {
      const newVal = Math.max(
        0.0,
        Math.min(1.0, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ chorusDepth: newVal });
    } else if (this.dragType === "chorusMix") {
      const newVal = Math.max(
        0.0,
        Math.min(1.0, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ chorusMix: newVal });
    } else if (this.dragType === "delayTime") {
      const newVal = Math.max(
        0.01,
        Math.min(2.0, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ delayTime: newVal });
    } else if (this.dragType === "delayFeedback") {
      const newVal = Math.max(
        0.0,
        Math.min(0.95, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ delayFeedback: newVal });
    } else if (this.dragType === "delayMix") {
      const newVal = Math.max(
        0.0,
        Math.min(1.0, this.startVal + deltaY * 0.005),
      );
      this.updateSelectedTrack({ delayMix: newVal });
    } else if (this.dragType === "reverbDecay") {
      const newVal = Math.max(
        0.1,
        Math.min(10.0, this.startVal + deltaY * 0.025),
      );
      this.updateSelectedTrack({ reverbDecay: newVal });
    } else if (this.dragType === "synthCutoff") {
      const newVal = Math.max(200, Math.min(8000, this.startVal + deltaY * 15));
      this.audio.updateSynthParams({ cutoff: newVal });
    } else if (this.dragType === "synthResonance") {
      const newVal = Math.max(
        0.1,
        Math.min(12.0, this.startVal + deltaY * 0.05),
      );
      this.audio.updateSynthParams({ resonance: newVal });
    } else if (this.dragType === "synthOctave") {
      const newVal = Math.max(
        -2,
        Math.min(2, Math.round(this.startVal + deltaY * 0.05)),
      );
      this.audio.updateSynthParams({ octave: newVal });
    } else if (this.dragType === "synthAttack") {
      const newVal = Math.max(
        0.002,
        Math.min(2.0, this.startVal + deltaY * 0.015),
      );
      this.audio.updateSynthParams({ attack: newVal });
    } else if (this.dragType === "synthRelease") {
      const newVal = Math.max(
        0.01,
        Math.min(3.0, this.startVal + deltaY * 0.02),
      );
      this.audio.updateSynthParams({ release: newVal });
    }
  }

  @HostListener("window:mouseup")
  onMouseUp() {
    if (this.dragType) {
      this.history.pushState();
    }
    this.activeDragTrackId = null;
    this.dragType = null;
  }

  startWaveformDrag(e: MouseEvent, type: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    this.dragType = type === "start" ? "waveStart" : "waveEnd";
    this.startX = e.clientX;
    this.startVal =
      type === "start" ? this.waveformStart() : this.waveformEnd();
  }

  startFadeDrag(e: MouseEvent) {
    e.preventDefault();
    this.dragType = "fade";
    this.startY = e.clientY;
    this.startVal = this.waveformFade();
  }

  startPitchDrag(e: MouseEvent) {
    e.preventDefault();
    this.dragType = "pitch";
    this.startY = e.clientY;
    this.startVal = this.waveformPitch();
  }

  toggleWaveformMode() {
    const modes: ("Complex" | "Beats" | "Tones" | "Texture")[] = [
      "Complex",
      "Beats",
      "Tones",
      "Texture",
    ];
    const i = modes.indexOf(this.waveformMode());
    this.waveformMode.set(modes[(i + 1) % modes.length]);
  }

  startVolumeDrag(e: MouseEvent, trackId: string) {
    e.preventDefault();
    const track = this.project.tracks().find((t) => t.id === trackId);
    if (!track) return;
    this.activeDragTrackId = trackId;
    this.dragType = "volume";
    this.startY = e.clientY;
    this.startVal = track.volume;
  }

  startPanDrag(e: MouseEvent, trackId: string) {
    e.preventDefault();
    const track = this.project.tracks().find((t) => t.id === trackId);
    if (!track) return;
    this.activeDragTrackId = trackId;
    this.dragType = "pan";
    this.startY = e.clientY;
    this.startVal = track.pan;
  }

  startEqDrag(e: MouseEvent, band: "low" | "mid" | "high") {
    e.preventDefault();
    const track = this.selectedTrack;
    if (!track) return;
    this.startY = e.clientY;
    this.dragType =
      band === "low" ? "eqLow" : band === "mid" ? "eqMid" : "eqHigh";
    this.startVal =
      band === "low"
        ? track.eqLow
        : band === "mid"
          ? track.eqMid
          : track.eqHigh;
  }

  startCompDrag(e: MouseEvent, param: "threshold" | "ratio") {
    e.preventDefault();
    const track = this.selectedTrack;
    if (!track) return;
    this.startY = e.clientY;
    this.dragType = param === "threshold" ? "compThreshold" : "compRatio";
    this.startVal =
      param === "threshold" ? track.compThreshold : track.compRatio;
  }

  startReverbMixDrag(e: MouseEvent) {
    e.preventDefault();
    const track = this.selectedTrack;
    if (!track) return;
    this.startY = e.clientY;
    this.dragType = "reverbMix";
    this.startVal = track.reverbMix;
  }

  startPluginDrag(
    e: MouseEvent,
    type:
      | "filterCutoff"
      | "filterReso"
      | "distortionDrive"
      | "distortionMix"
      | "chorusRate"
      | "chorusDepth"
      | "chorusMix"
      | "delayTime"
      | "delayFeedback"
      | "delayMix"
      | "reverbDecay"
      | "reverbMix"
      | "compThreshold"
      | "compRatio",
  ) {
    e.preventDefault();
    const track = this.selectedTrack;
    if (!track) return;
    this.startY = e.clientY;
    this.dragType = type;
    const tRecord = track as unknown as Record<
      string,
      number | string | undefined
    >;
    this.startVal = tRecord[type] !== undefined ? (tRecord[type] as number) : 0;
    // Special handlings for default parameters
    if (type === "filterCutoff" && tRecord[type] === undefined)
      this.startVal = 20000;
    if (type === "filterReso" && tRecord[type] === undefined)
      this.startVal = 1.0;
    if (type === "chorusRate" && tRecord[type] === undefined)
      this.startVal = 1.0;
    if (type === "delayTime" && tRecord[type] === undefined)
      this.startVal = 0.25;
    if (type === "delayFeedback" && tRecord[type] === undefined)
      this.startVal = 0.35;
    if (type === "reverbDecay" && tRecord[type] === undefined)
      this.startVal = 2.0;
  }

  getKnobRotation(param: string): string {
    const track = this.selectedTrack;
    if (!track) return "rotate(-135deg)";

    const tRecord = track as unknown as Record<
      string,
      number | string | undefined
    >;
    let val = tRecord[param] !== undefined ? (tRecord[param] as number) : 0;

    // Set standard default fallback ranges and degrees
    let min = 0;
    let max = 1;

    if (param === "filterCutoff") {
      if (val === undefined || val === 0) val = 20000;
      min = 20;
      max = 20000;
    } else if (param === "filterReso") {
      if (val === undefined || val === 0) val = 1.0;
      min = 0.1;
      max = 15.0;
    } else if (param === "distortionDrive") {
      min = 0;
      max = 100;
    } else if (param === "chorusRate") {
      if (val === undefined || val === 0) val = 1.0;
      min = 0.1;
      max = 10.0;
    } else if (param === "delayTime") {
      if (val === undefined || val === 0) val = 0.25;
      min = 0.01;
      max = 2.0;
    } else if (param === "delayFeedback") {
      if (val === undefined || val === 0) val = 0.35;
      min = 0;
      max = 0.95;
    } else if (param === "reverbDecay") {
      if (val === undefined || val === 0) val = 2.0;
      min = 0.1;
      max = 10.0;
    } else if (param === "compThreshold") {
      min = -60;
      max = 0;
    } else if (param === "compRatio") {
      min = 1;
      max = 20;
    } else if (param === "reverbMix") {
      min = 0;
      max = 1.0;
    } else if (param === "delayMix") {
      min = 0;
      max = 1.0;
    } else if (param === "chorusMix") {
      min = 0;
      max = 1.0;
    } else if (param === "chorusDepth") {
      min = 0;
      max = 1.0;
    } else if (param === "distortionMix") {
      min = 0;
      max = 1.0;
    }

    const pct = Math.max(0, Math.min(1, (val - min) / (max - min)));
    const deg = pct * 270 - 135;
    return `rotate(${deg}deg)`;
  }

  toggleFilterType() {
    const track = this.selectedTrack;
    if (!track) return;
    const types: ("lowpass" | "highpass" | "bandpass")[] = [
      "lowpass",
      "highpass",
      "bandpass",
    ];
    const current = track.filterType || "lowpass";
    const nextIdx = (types.indexOf(current) + 1) % types.length;
    this.updateSelectedTrack({ filterType: types[nextIdx] });
  }

  startSynthKnobDrag(
    e: MouseEvent,
    param: "cutoff" | "resonance" | "octave" | "attack" | "release",
  ) {
    e.preventDefault();
    this.startY = e.clientY;
    this.dragType =
      param === "cutoff"
        ? "synthCutoff"
        : param === "resonance"
          ? "synthResonance"
          : param === "octave"
            ? "synthOctave"
            : param === "attack"
              ? "synthAttack"
              : "synthRelease";

    this.startVal =
      param === "cutoff"
        ? this.audio.synthCutoff
        : param === "resonance"
          ? this.audio.synthResonance
          : param === "octave"
            ? this.audio.synthOctave
            : param === "attack"
              ? this.audio.synthAttack
              : this.audio.synthRelease;
  }

  activeBank = signal<'A' | 'B' | 'C' | 'D'>('A');

  currentPads = computed(() => {
    const bank = this.activeBank();
    if (bank === 'A') {
      return [
        { id: 13, name: "Clap", color: "#a855f7" },
        { id: 14, name: "Snare", color: "#a855f7" },
        { id: 15, name: "HiHat", color: "#a855f7" },
        { id: 16, name: "Crash", color: "#a855f7" },

        { id: 9, name: "Kick", color: "#3b82f6" },
        { id: 10, name: "Rim", color: "#3b82f6" },
        { id: 11, name: "Perc 1", color: "#3b82f6" },
        { id: 12, name: "Perc 2", color: "#3b82f6" },

        { id: 5, name: "Bassline", color: "#10b981" },
        { id: 6, name: "Synth", color: "#10b981" },
        { id: 7, name: "Pad", color: "#10b981" },
        { id: 8, name: "Lead", color: "#10b981" },

        { id: 1, name: "FX", color: "#eab308" },
        { id: 2, name: "Vocal", color: "#eab308" },
        { id: 3, name: "Impact", color: "#eab308" },
        { id: 4, name: "Shaker", color: "#eab308" },
      ];
    } else if (bank === 'B') {
      return [
        { id: 13, name: "Lofi-Snr", color: "#a855f7" },
        { id: 14, name: "Dust-Clap", color: "#a855f7" },
        { id: 15, name: "Vinyl-Crk", color: "#a855f7" },
        { id: 16, name: "Closed-Ht", color: "#a855f7" },

        { id: 9, name: "Lofi-Kck", color: "#3b82f6" },
        { id: 10, name: "Sub-Bass", color: "#3b82f6" },
        { id: 11, name: "Rhodes-Chd", color: "#3b82f6" },
        { id: 12, name: "Epiano-Sh", color: "#3b82f6" },

        { id: 5, name: "Jazzy-Fl", color: "#10b981" },
        { id: 6, name: "Swell", color: "#10b981" },
        { id: 7, name: "Shree", color: "#10b981" },
        { id: 8, name: "Gtr-Chd", color: "#10b981" },

        { id: 1, name: "Air-Horn", color: "#eab308" },
        { id: 2, name: "Shout-Ah", color: "#eab308" },
        { id: 3, name: "Space-Out", color: "#eab308" },
        { id: 4, name: "Retro-Beep", color: "#eab308" },
      ];
    } else if (bank === 'C') {
      return [
        { id: 13, name: "909-Snr", color: "#a855f7" },
        { id: 14, name: "Rave-Clp", color: "#a855f7" },
        { id: 15, name: "Ride-Cym", color: "#a855f7" },
        { id: 16, name: "Laser-Ht", color: "#a855f7" },

        { id: 9, name: "909-Kck", color: "#3b82f6" },
        { id: 10, name: "Acid-Bas", color: "#3b82f6" },
        { id: 11, name: "Rave-Stb", color: "#3b82f6" },
        { id: 12, name: "Chord-St", color: "#3b82f6" },

        { id: 5, name: "Psy-Bass", color: "#10b981" },
        { id: 6, name: "Beep-Ch", color: "#10b981" },
        { id: 7, name: "Reverb-Wv", color: "#10b981" },
        { id: 8, name: "Scream-Ld", color: "#10b981" },

        { id: 1, name: "D-Roll", color: "#eab308" },
        { id: 2, name: "Siren-Sfx", color: "#eab308" },
        { id: 3, name: "Sub-Drop", color: "#eab308" },
        { id: 4, name: "Trance- Pl", color: "#eab308" },
      ];
    } else {
      return [
        { id: 13, name: "Rock-Snr", color: "#a855f7" },
        { id: 14, name: "Rimshot", color: "#a855f7" },
        { id: 15, name: "Tom-Low", color: "#a855f7" },
        { id: 16, name: "Tom-High", color: "#a855f7" },

        { id: 9, name: "Aco-Kck", color: "#3b82f6" },
        { id: 10, name: "Tamb", color: "#3b82f6" },
        { id: 11, name: "Cowbell", color: "#3b82f6" },
        { id: 12, name: "Maraca", color: "#3b82f6" },

        { id: 5, name: "Glass-Clk", color: "#10b981" },
        { id: 6, name: "Wood-Blk", color: "#10b981" },
        { id: 7, name: "Whistle", color: "#10b981" },
        { id: 8, name: "Snap-Clp", color: "#10b981" },

        { id: 1, name: "Metronome", color: "#eab308" },
        { id: 2, name: "Beats", color: "#eab308" },
        { id: 3, name: "Bell-Ring", color: "#eab308" },
        { id: 4, name: "Slinky", color: "#eab308" },
      ];
    }
  });

  playPad(pad: { id: number; name: string; color: string }) {
    this.activePad.set(pad.id);
    this.audio.playOneShot(pad.name.toLowerCase());
    setTimeout(() => {
      if (this.activePad() === pad.id) {
        this.activePad.set(null);
      }
    }, 150);
  }

  toggleSynthWave() {
    const waves: OscillatorType[] = ["sawtooth", "sine", "triangle", "square"];
    const current = this.audio.synthWaveType;
    const index = waves.indexOf(current);
    const next = waves[(index + 1) % waves.length];
    this.audio.updateSynthParams({ waveType: next });
  }

  constructor() {
    effect(() => {
      if (this.project.isPlaying()) {
        this.animateVU();
      } else {
        if (this.animFrame) {
          if (typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(this.animFrame);
          }
        }
        this.vuValuesL.set(Array(24).fill(0));
        this.vuValuesR.set(Array(24).fill(0));
      }
    });

    effect(() => {
      const tab = this.activeTab();
      const sample = this.workspace.activeSample();
      if (tab === "editor" && sample?.url) {
        this.audio.getAudioBuffer(sample.url).then((buffer) => {
          if (buffer) {
            setTimeout(() => this.drawWaveform(buffer), 50);
          }
        });
      } else if (tab === "editor") {
        setTimeout(() => this.clearWaveform(), 50);
      }
    });
  }

  drawWaveform(buffer: AudioBuffer) {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = (canvas.width = canvas.offsetWidth || 300);
    const height = (canvas.height = canvas.offsetHeight || 100);

    ctx.clearRect(0, 0, width, height);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.strokeStyle = "#b82bf2";
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
  }

  clearWaveform() {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  animateVU = () => {
    if (!this.project.isPlaying()) return;

    const pos = this.project.playheadPosition();
    const noiseL = Math.abs(Math.sin(pos * 5) + Math.cos(pos * 12)) * 0.5 * 24;
    const noiseR = Math.abs(Math.cos(pos * 6) + Math.sin(pos * 11)) * 0.5 * 24;

    const newL = Array(24)
      .fill(0)
      .map((_, i) => (i < noiseL ? 1 : 0));
    const newR = Array(24)
      .fill(0)
      .map((_, i) => (i < noiseR ? 1 : 0));

    this.vuValuesL.set(newL.reverse());
    this.vuValuesR.set(newR.reverse());

    if (typeof requestAnimationFrame !== "undefined") {
      this.animFrame = requestAnimationFrame(this.animateVU);
    }
  };

  getVuClass(active: number, index: number) {
    if (!active) {
      if (index < 3) return "bg-red-500 opacity-20";
      if (index < 7) return "bg-yellow-500 opacity-20";
      return "bg-green-500 opacity-20";
    }
    if (index < 3) return "bg-red-500";
    if (index < 7) return "bg-yellow-500";
    return "bg-green-500";
  }

  ngOnDestroy() {
    if (this.animFrame && typeof cancelAnimationFrame !== "undefined")
      cancelAnimationFrame(this.animFrame);
  }
}
