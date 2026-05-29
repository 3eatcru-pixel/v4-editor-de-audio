import { Component, inject, HostListener, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProjectService } from "../core/project.service";
import { WorkspaceService } from "../core/workspace.service";
import { TimelineCanvasComponent } from "./timeline-canvas";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-timeline-view",
  standalone: true,
  imports: [CommonModule, TimelineCanvasComponent, MatIconModule],
  host: {
    class: "flex flex-col flex-1 w-full h-full min-h-0",
  },
  template: `
    <div class="flex flex-col h-full w-full bg-[#0d0d12] relative z-0">
      <!-- Timeline Toolbar -->
      <div
        class="h-10 bg-[#08080c] border-b border-[#1a1a24] flex items-center px-4 justify-between select-none shrink-0 w-full z-20 drop-shadow-sm"
      >
        <div class="flex items-center gap-4">
          <div
            class="flex items-center gap-1.5 p-1 bg-[#121218] rounded-md border border-[#1a1a24] shadow-inner"
          >
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'pointer'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('pointer')"
              title="Pointer Tool"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]">near_me</mat-icon>
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'draw'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('draw')"
              title="Draw Tool"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]">edit</mat-icon>
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'cut'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('cut')"
              title="Cut Tool"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]"
                >content_cut</mat-icon
              >
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'join'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('join')"
              title="Join Tool"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]"
                >join_inner</mat-icon
              >
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'stretch'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('stretch')"
              title="Time Stretch Tool"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]">open_with</mat-icon>
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded transition-all"
              [class]="
                workspace.activeTool() === 'slip'
                  ? 'bg-[#1a1a24] text-white border border-[#2a2a35] shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                  : 'hover:bg-[#1a1a24] hover:text-white text-[#888] border-transparent'
              "
              (click)="workspace.activeTool.set('slip')"
              title="Slip Tool (Move Content Inside Clip)"
            >
              <mat-icon class="text-[14px] w-[14px] h-[14px]">swap_horiz</mat-icon>
            </button>
          </div>
          <div class="w-px h-5 bg-[#2a2a35]/50"></div>
          <div
            class="flex items-center gap-1 p-0.5 bg-[#121218] rounded-md border border-[#1a1a24] shadow-inner font-mono select-none"
          >
            <!-- Snap Toggle & Selector -->
            <div class="relative flex items-center">
              <button
                class="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors border-none"
                [class]="workspace.snapMode() !== 'Off' ? 'bg-[#b82bf2]/20 text-[#b82bf2]' : 'bg-transparent text-[#666] hover:text-[#d1d1d1] hover:bg-[#1a1a24]'"
                (click)="setSnapMode(workspace.snapMode() === 'Off' ? 'Beat' : 'Off')"
                title="Toggle Snap to Grid"
              >
                <mat-icon class="text-[14px] w-[14px] h-[14px]">architecture</mat-icon>
              </button>
              
              <button
                class="flex items-center gap-0.5 px-1.5 h-6 cursor-pointer hover:bg-[#1a1a24] text-[#a0a0b0] font-bold text-[9px] transition-colors border-none bg-transparent rounded"
                (click)="toggleDropdown('snap', $event)"
                title="Snap Resolution"
              >
                {{ workspace.snapMode() === 'Off' ? 'FREE' : workspace.snapMode() }}
                <mat-icon class="text-[10px] w-[10px] h-[10px] opacity-60">arrow_drop_down</mat-icon>
              </button>
              
              @if (activeDropdown() === 'snap') {
                <div class="absolute left-0 top-full mt-1.5 w-32 bg-[#0a0a0f] border border-[#1a1a24] rounded shadow-2xl p-1 flex flex-col gap-0.5 z-50">
                  <div class="text-[7.5px] text-[#666] uppercase tracking-widest px-2 py-1 font-sans font-bold">Snap To</div>
                  @for (val of ['Bar', 'Beat', 'Grid', 'Off']; track val) {
                    <button
                      class="text-left px-2 py-1.5 rounded flex items-center justify-between text-[10px] font-medium border-none cursor-pointer transition-colors"
                      [class]="workspace.snapMode() === val ? 'bg-[#b82bf2]/20 text-[#b82bf2]' : 'text-[#a0a0b0] bg-transparent hover:bg-[#161622] hover:text-white'"
                      (click)="setSnapMode($any(val))"
                    >
                      <span>{{ val === 'Off' ? 'Free (No Snap)' : val }}</span>
                      @if (workspace.snapMode() === val) {
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">check</mat-icon>
                      }
                    </button>
                  }
                </div>
              }
            </div>

            <div class="w-px h-4 bg-[#2a2a35]/60 mx-0.5"></div>

            <!-- Grid Resolution Selector -->
            <div class="relative flex items-center">
              <div class="text-[#656575] text-[8px] font-sans font-bold uppercase tracking-widest px-1">Grid</div>
              <button
                class="flex items-center gap-0.5 px-1.5 h-6 cursor-pointer hover:bg-[#1a1a24] text-[#06b6d4] font-bold text-[10px] transition-colors border-none bg-transparent rounded"
                (click)="toggleDropdown('grid', $event)"
                title="Grid Resolution"
              >
                {{ workspace.gridSize() === 'Off' ? 'OFF' : workspace.gridSize() }}
                <mat-icon class="text-[10px] w-[10px] h-[10px] opacity-60">arrow_drop_down</mat-icon>
              </button>
              
              @if (activeDropdown() === 'grid') {
                <div class="absolute left-0 top-full mt-1.5 w-32 bg-[#0a0a0f] border border-[#1a1a24] rounded shadow-2xl p-1 flex flex-col gap-0.5 z-50">
                   <div class="text-[7.5px] text-[#666] uppercase tracking-widest px-2 py-1 font-sans font-bold">Grid Line</div>
                  @for (val of ['1/4', '1/8', '1/16', '1/32', 'Off']; track val) {
                    <button
                      class="text-left px-2 py-1.5 rounded flex items-center justify-between text-[10px] font-medium border-none cursor-pointer transition-colors"
                      [class]="workspace.gridSize() === val ? 'bg-[#06b6d4]/20 text-[#06b6d4]' : 'text-[#a0a0b0] bg-transparent hover:bg-[#161622] hover:text-white'"
                      (click)="setGridSize($any(val))"
                    >
                      <span>{{ val === 'Off' ? 'Hide Grid' : val }}</span>
                      @if (workspace.gridSize() === val) {
                        <mat-icon class="text-[12px] w-[12px] h-[12px]">check</mat-icon>
                      }
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Advanced Timeline Loop & Marker Controls -->
          <div class="w-px h-5 bg-[#2a2a35]/50"></div>
          <div class="flex items-center gap-2">
            <button
              class="px-2 h-6 flex items-center gap-1 bg-[#121218] rounded border border-[#1a1a24] text-[9px] uppercase font-bold text-slate-300 hover:bg-[#232332] transition-colors cursor-pointer"
              [class.bg-[#b82bf2]/20]="project.loopEnabled()"
              [class.border-[#b82bf2]/50]="project.loopEnabled()"
              (click)="project.loopEnabled.set(!project.loopEnabled())"
              title="Toggle Timeline Looping"
            >
              <mat-icon class="text-[12px] w-[12px] h-[12px] text-[#b82bf2]">loop</mat-icon>
              <span>Loop: {{ project.loopEnabled() ? 'On' : 'Off' }}</span>
            </button>

            <!-- Marker Addition button -->
            <button
              class="px-2 h-6 flex items-center gap-1 bg-[#121218] hover:bg-[#232332] rounded border border-[#1a1a24] text-[9px] uppercase font-bold text-slate-300 transition-colors cursor-pointer"
              (click)="addMarkerAtPlayhead()"
              title="Add Marker at Current Playhead"
            >
              <mat-icon class="text-[12px] w-[12px] h-[12px] text-emerald-500">flag</mat-icon>
              <span>+ Marker</span>
            </button>
          </div>
        </div>
        <div
          class="flex items-center gap-1 p-1 bg-[#121218] rounded-md border border-[#1a1a24] shadow-inner"
        >
          <button
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-[#232332] text-[#888] hover:text-white transition-colors"
            (click)="onZoomOut()"
          >
            <mat-icon class="text-[16px] w-[16px] h-[16px]">zoom_out</mat-icon>
          </button>
          <button
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-[#232332] text-[#888] hover:text-white transition-colors"
            (click)="onZoomIn()"
          >
            <mat-icon class="text-[16px] w-[16px] h-[16px]">zoom_in</mat-icon>
          </button>
        </div>
      </div>

      <!-- Time Ruler Row Top -->
      <div
        class="h-8 bg-gradient-to-b from-[#161622] to-[#0c0c12] border-b border-[#1a1a24] flex shrink-0 sticky top-0 z-10 w-full overflow-hidden shadow-sm shadow-black/20"
      >
        <div class="w-[260px] bg-transparent border-r border-[#1a1a24] relative shrink-0">
          <div
            class="absolute right-3 top-2 text-[#b82bf2] text-[9px] font-bold tracking-widest uppercase"
          >
            Meas
          </div>
          <button
            class="absolute right-[44px] top-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a1a24] text-[#a0a0b0] transition-colors"
            (click)="project.addTrack('midi')"
          >
            <mat-icon
              class="text-[14px] w-[14px] h-[14px]"
              title="Add MIDI Track"
              >piano</mat-icon
            >
          </button>
          <button
            class="absolute right-[22px] top-1.5 w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a1a24] text-[#a0a0b0] transition-colors"
            (click)="project.addTrack('audio')"
          >
            <mat-icon
              class="text-[14px] w-[14px] h-[14px]"
              title="Add Audio Track"
              >mic</mat-icon
            >
          </button>
          <span
            class="absolute left-4 top-2.5 text-[9px] font-bold text-[#656575] tracking-widest"
            >TIMELINE</span
          >
        </div>
        <div
          class="flex-1 relative overflow-hidden cursor-text"
          (wheel)="onWheel($event)"
          (mousedown)="onRulerClick($event)"
          (mousemove)="onRulerDrag($event)"
          (mouseup)="onRulerUp()"
          (mouseleave)="onRulerUp()"
        >
          <div
            class="absolute top-0 bottom-0 pointer-events-none select-none flex items-end"
            [style.transform]="'translateX(' + -workspace.scrollX() + 'px)'"
          >
            <!-- Timeline Grid Markers -->
            @for (bar of timeRulerBars; track bar) {
              <!-- Bar Marker -->
              <div
                class="h-full border-l border-[#3f3f50] absolute top-0 flex flex-col justify-start"
                [style.left.px]="bar * workspace.zoomX() * 4"
              >
                <div class="px-1.5 pt-0.5 flex items-baseline gap-1">
                  <span class="text-[#e2e8f0] text-[10px] font-bold leading-none tracking-wider shadow-sm">{{ bar + 1 }}</span>
                  @if (workspace.zoomX() > 12) {
                    <span class="text-[#06b6d4]/70 text-[8.5px] font-mono leading-none tracking-tighter">{{ getBarTimeSeconds(bar) }}s</span>
                  }
                </div>
              </div>

              <!-- Quarter Notes (Beats) -->
              @if (workspace.zoomX() > 10) {
                @for (beat of [1, 2, 3]; track beat) {
                   <div
                    class="h-[12px] border-l border-[#2d2d3d] absolute bottom-0"
                    [style.left.px]="(bar * 4 + beat) * workspace.zoomX()"
                   >
                     @if (workspace.zoomX() > 40) {
                        <span class="absolute -top-3 left-1 text-[#666] text-[8px] font-mono opacity-60">{{ beat + 1 }}</span>
                     }
                   </div>
                }
              }

              <!-- 8th Notes -->
              @if (workspace.zoomX() > 35) {
                @for (eighth of [0.5, 1.5, 2.5, 3.5]; track eighth) {
                   <div
                    class="h-[6px] border-l border-[#20202d] absolute bottom-0"
                    [style.left.px]="(bar * 4 + eighth) * workspace.zoomX()"
                   ></div>
                }
              }
              
              <!-- 16th Notes -->
              @if (workspace.zoomX() > 65) {
                @for (sixteenth of [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]; track sixteenth) {
                   <div
                    class="h-[4px] border-l border-[#1a1a24] absolute bottom-0"
                    [style.left.px]="(bar * 4 + sixteenth) * workspace.zoomX()"
                   ></div>
                }
              }
            }

            <!-- Loop Region overlay in Ruler -->
            @if (project.loopEnabled()) {
              <div
                class="absolute top-0 bottom-0 bg-[#b82bf2]/10 border-l border-r border-[#b82bf2]/60 pointer-events-none"
                [style.left.px]="project.loopStart() * workspace.zoomX()"
                [style.width.px]="(project.loopEnd() - project.loopStart()) * workspace.zoomX()"
              >
                <div class="w-full h-[3px] bg-gradient-to-r from-[#b82bf2] to-[#c93cff] absolute top-0 shadow-[0_0_10px_rgba(184,43,242,0.8)]"></div>
              </div>
            }

            <!-- Playhead Head inside the Ruler -->
            <div 
              class="absolute top-0 bottom-0 pointer-events-none z-50 flex items-end drop-shadow-md"
              [style.left.px]="project.playheadPosition() * workspace.zoomX()">
              <div class="w-3 h-3 text-[#b82bf2] -ml-[6px] flex justify-center items-end pb-[1px] shadow-[#b82bf2]/40">
                <svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor">
                  <path d="M0 0h12v4L6 9 0 4z" />
                </svg>
              </div>
              <div class="absolute h-8 w-px bg-[#b82bf2] opacity-0"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden relative">
        <!-- Track Headers -->
        <div
          class="w-[260px] bg-[#0d0d12] border-r border-[#1a1a24] z-10 flex-shrink-0 relative overflow-hidden h-full"
          (wheel)="onWheel($event)"
        >
          <div
            class="absolute w-full top-0 left-0 flex-col flex"
            [style.transform]="'translateY(' + -workspace.scrollY() + 'px)'"
          >
            @for (track of project.tracks(); track track.id; let i = $index) {
              <div
                class="h-[72px] flex items-center px-1 select-none relative group transition-all duration-200 border-b"
                [class]="track.showAutomation 
                  ? 'bg-[#112028] border-[#06b6d4]/40 shadow-[inset_4px_0_0_#06b6d4]' 
                  : (i % 2 === 0 ? 'bg-[#14141e] hover:bg-[#1c1c2a] border-[#1a1a24]' : 'bg-[#0e0e15] hover:bg-[#1c1c2a] border-[#1a1a24]')"
              >
                <div
                  class="w-1.5 h-[50px] rounded-full mr-3 shrink-0 cursor-pointer hover:scale-110 transition-transform shadow-md"
                  [style.background-color]="track.color"
                  (click)="project.cycleTrackColor(track.id)"
                  (keydown.enter)="project.cycleTrackColor(track.id)"
                  (keydown.space)="project.cycleTrackColor(track.id)"
                  tabindex="0"
                  role="button"
                  [attr.aria-label]="'Cycle track color ' + track.name"
                  title="Change Color"
                ></div>

                <div
                  class="flex-1 flex flex-col justify-center gap-1.5 overflow-hidden pr-3"
                >
                  <div class="flex justify-between items-center w-full">
                    <div class="flex items-center gap-2 overflow-hidden">
                      <span
                        class="text-[10px] font-mono font-bold opacity-60"
                        [style.color]="track.color"
                        >{{ i + 1 | number: "2.0" }}</span
                      >
                      <span
                        class="text-[12px] text-white font-medium truncate tracking-wide"
                        >{{ track.name }}</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <button
                        class="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                        title="Toggle Automation"
                        (click)="
                          toggleAutomation(track.id, !track.showAutomation)
                        "
                        [class.text-[#06b6d4]]="track.showAutomation"
                      >
                        <mat-icon class="text-[14px] w-[14px] h-[14px]"
                          >timeline</mat-icon
                        >
                      </button>
                      <button
                        class="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10"
                        title="Track Settings"
                      >
                        <mat-icon
                          class="text-[14px] w-[14px] h-[14px] text-[#888] hover:text-white transition-colors"
                          >tune</mat-icon
                        >
                      </button>
                      <button
                        class="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-red-500/70 hover:text-red-400 transition-colors"
                        (click)="project.deleteTrack(track.id)"
                        title="Delete Track"
                      >
                        <mat-icon class="text-[14px] w-[14px] h-[14px]"
                          >delete</mat-icon
                        >
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center justify-between w-full">
                    <div class="flex gap-1 shrink-0">
                      <button
                        class="w-5 h-5 rounded bg-[#1e1e28] border border-[#2a2a35] text-[9px] font-bold text-[#888] flex items-center justify-center transition-all hover:bg-[#2a2a35]"
                        [class.bg-red-500]="track.mute"
                        [class.border-red-500]="track.mute"
                        [class.text-white]="track.mute"
                        (click)="toggleMute(track.id, !track.mute)"
                      >
                        M
                      </button>
                      <button
                        class="w-5 h-5 rounded bg-[#1e1e28] border border-[#2a2a35] text-[9px] font-bold text-[#888] flex items-center justify-center transition-all hover:bg-[#2a2a35]"
                        [class.bg-yellow-500]="track.solo"
                        [class.border-yellow-500]="track.solo"
                        [class.text-[#000]]="track.solo"
                        (click)="toggleSolo(track.id, !track.solo)"
                      >
                        S
                      </button>
                      @if (track.showAutomation) {
                        <select
                          class="h-5 bg-transparent text-[9px] text-[#06b6d4] uppercase font-bold outline-none cursor-pointer pl-1"
                          (change)="
                            setAutomationParam(
                              track.id,
                              $any($event.target).value
                            )
                          "
                          [value]="track.automationParam"
                        >
                          <option
                            value="volume"
                            class="bg-[#1a1a24] text-[#06b6d4]"
                          >
                            Vol
                          </option>
                          <option
                            value="pan"
                            class="bg-[#1a1a24] text-[#06b6d4]"
                          >
                            Pan
                          </option>
                        </select>
                      } @else {
                        <button
                          class="w-5 h-5 rounded bg-[#1e1e28] border border-[#2a2a35] text-[#888] flex items-center justify-center transition-all hover:bg-[#2a2a35] shadow-inner"
                        >
                          <div
                            class="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_4px_rgba(220,38,38,0.5)]"
                          ></div>
                        </button>
                      }
                    </div>
                    <div
                      class="flex-1 px-3 flex items-center cursor-ew-resize group/vol"
                      (mousedown)="startVolumeDrag($event, track.id)"
                    >
                      <div
                        class="w-full h-[3px] bg-[#1a1a24] rounded-full flex items-center relative pointer-events-none overflow-visible"
                      >
                        <div
                          class="h-full rounded-l-full overflow-hidden"
                          [style.width.%]="track.volume * 100"
                          [style.backgroundColor]="track.color"
                        ></div>
                        <div
                          class="w-[3px] h-[9px] bg-white rounded-full absolute shadow-[0_0_5px_rgba(255,255,255,0.6)] pointer-events-none transition-transform group-hover/vol:scale-y-150"
                          [style.left.%]="
                            Math.min(95, Math.max(0, track.volume * 100 - 5))
                          "
                        ></div>
                      </div>
                    </div>
                    <div
                      class="w-5 h-5 shrink-0 rounded-full border-2 border-[#2a2a35] relative cursor-ns-resize shadow-sm flex items-center justify-center bg-[#161620]"
                      (mousedown)="startPanDrag($event, track.id)"
                    >
                      <div
                        class="w-[2px] h-2 bg-[#ccc] origin-bottom rounded-full pointer-events-none absolute bottom-1"
                        [style.transform]="'rotate(' + track.pan * 135 + 'deg)'"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            }
            <!-- Empty Tracks -->
             @for (empty of emptyRows; track $index) {
              <div
                class="h-[72px] border-b border-[#1a1a24] flex items-center justify-center select-none bg-[#0b0b10] text-[#333] hover:text-[#666] hover:bg-[#121218] transition-colors cursor-pointer group"
                (click)="project.addTrack('audio')"
                (keydown.enter)="project.addTrack('audio')"
                (keydown.space)="project.addTrack('audio')"
                tabindex="0"
                role="button"
                [attr.aria-label]="'Click to add Audio Track'"
                title="Click to add Audio Track"
              >
                <mat-icon
                  class="text-[16px] w-[16px] h-[16px] group-hover:scale-110 transition-transform text-inherit"
                  >add</mat-icon
                >
                <span
                  class="text-[9px] font-bold tracking-widest ml-1 text-inherit"
                  >ADD TRACK</span
                >
              </div>
            }
          </div>
        </div>

        <!-- Canvas -->
        <div
          class="flex-1 overflow-hidden relative flex"
          (dragover)="onDragOver($event)"
          (drop)="onDropCanvas($event)"
        >
          <app-timeline-canvas
            class="flex-1 min-w-0 min-h-0 block w-full relative"
          ></app-timeline-canvas>
        </div>
      </div>
    </div>
  `,
})
export class TimelineViewComponent {
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);

  addMarkerAtPlayhead() {
    const playhead = this.project.playheadPosition();
    const markers = this.project.markers();
    const name = `M-${markers.length + 1}`;
    this.project.markers.set([
      ...markers,
      { id: 'm' + Date.now(), name, beat: playhead }
    ]);
  }

  @HostListener("window:keydown", ["$event"])
  onKeyDown(e: KeyboardEvent) {
    const focusedEl = document.activeElement;
    if (focusedEl && (focusedEl.tagName === "INPUT" || focusedEl.tagName === "SELECT" || focusedEl.tagName === "TEXTAREA")) {
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      this.deleteSelectedClips();
    } else if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
      this.duplicateSelectedClips();
    } else if (e.key === "m") {
      this.toggleMuteSelectedClips();
    }
  }

  deleteSelectedClips() {
    const tracks = this.project.tracks();
    tracks.forEach((track) => {
      const selectedExist = track.clips.some((c) => c.selected);
      if (selectedExist) {
        const remaining = track.clips.filter((c) => !c.selected);
        this.project.updateTrack(track.id, { clips: remaining });
      }
    });
    this.workspace.selectedClipId.set(null);
  }

  duplicateSelectedClips() {
    const tracks = this.project.tracks();
    tracks.forEach((track) => {
      const selected = track.clips.filter((c) => c.selected);
      if (selected.length > 0) {
        const duplicated = selected.map((clip) => {
          return {
            ...clip,
            id: 'c' + Date.now() + Math.random().toString(36).substr(2, 4),
            start: clip.start + clip.duration,
            selected: false,
          };
        });
        this.project.updateTrack(track.id, {
          clips: [...track.clips, ...duplicated],
        });
      }
    });
  }

  toggleMuteSelectedClips() {
    const tracks = this.project.tracks();
    tracks.forEach((track) => {
      const updated = track.clips.map((clip) => {
        if (clip.selected) {
          return { ...clip, muted: !clip.muted };
        }
        return clip;
      });
      this.project.updateTrack(track.id, { clips: updated });
    });
  }

  timeRulerBars = Array.from({ length: 100 }, (_, i) => i);
  emptyRows = Array.from({ length: 20 }, (_, i) => i);
  isDraggingRuler = false;
  Math = Math;

  getBarTimeSeconds(bar: number): string {
    const beats = bar * 4;
    const seconds = beats * (60 / this.project.bpm());
    return seconds.toFixed(1);
  }

  activeDropdown = signal<'grid' | 'snap' | null>(null);

  @HostListener('document:click')
  closeDropdowns() {
    this.activeDropdown.set(null);
  }

  toggleDropdown(type: 'grid' | 'snap', e: MouseEvent) {
    e.stopPropagation();
    this.activeDropdown.set(this.activeDropdown() === type ? null : type);
  }

  setGridSize(size: '1/4' | '1/8' | '1/16' | '1/32' | 'Off') {
    this.workspace.gridSize.set(size);
    this.activeDropdown.set(null);
  }

  setSnapMode(mode: 'Bar' | 'Beat' | 'Grid' | 'Off') {
    this.workspace.snapMode.set(mode);
    this.activeDropdown.set(null);
  }

  private getSnappedTime(beats: number): number {
    const snap = this.workspace.snapMode();
    const grid = this.workspace.gridSize();

    if (snap === "Off") {
      return beats;
    }

    let snapInterval = 0.25; // default 1/16
    if (snap === "Bar") {
      snapInterval = 4.0;
    } else if (snap === "Beat") {
      snapInterval = 1.0;
    } else if (snap === "Grid") {
      if (grid === "1/4") snapInterval = 1.0;
      else if (grid === "1/8") snapInterval = 0.5;
      else if (grid === "1/16") snapInterval = 0.25;
      else if (grid === "1/32") snapInterval = 0.125;
      else if (grid === "Off") snapInterval = 0.001;
    }

    return Math.round(beats / snapInterval) * snapInterval;
  }

  private activeDragTrackId: string | null = null;
  private dragType: "volume" | "pan" | null = null;
  private startY = 0;
  private startX = 0;
  private startVal = 0;

  @HostListener("window:mousemove", ["$event"])
  onMouseMove(e: MouseEvent) {
    if (!this.activeDragTrackId || !this.dragType) return;

    if (this.dragType === "volume") {
      const deltaX = e.clientX - this.startX;
      const deltaVol = deltaX * 0.01;
      const newVol = Math.max(0, Math.min(1.0, this.startVal + deltaVol));
      this.project.updateTrack(this.activeDragTrackId, { volume: newVol });
    } else if (this.dragType === "pan") {
      const deltaY = this.startY - e.clientY;
      const deltaPan = deltaY * 0.01;
      const newPan = Math.max(-1.0, Math.min(1.0, this.startVal + deltaPan));
      this.project.updateTrack(this.activeDragTrackId, { pan: newPan });
    }
  }

  @HostListener("window:mouseup")
  onMouseUp() {
    this.activeDragTrackId = null;
    this.dragType = null;
  }

  onZoomIn() {
    this.workspace.setZoom(this.workspace.zoomX() * 1.2);
  }

  onZoomOut() {
    this.workspace.setZoom(this.workspace.zoomX() * 0.8);
  }

  startVolumeDrag(e: MouseEvent, trackId: string) {
    e.preventDefault();
    const track = this.project.tracks().find((t) => t.id === trackId);
    if (!track) return;
    this.activeDragTrackId = trackId;
    this.dragType = "volume";
    this.startX = e.clientX;
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

  onRulerClick(e: MouseEvent) {
    this.isDraggingRuler = true;
    this.setPlayheadFromMouseEvent(e);
  }

  onRulerDrag(e: MouseEvent) {
    if (this.isDraggingRuler) {
      this.setPlayheadFromMouseEvent(e);
    }
  }

  onRulerUp() {
    this.isDraggingRuler = false;
  }

  private setPlayheadFromMouseEvent(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalX = x + this.workspace.scrollX();
    const beats = Math.max(0, totalX / this.workspace.zoomX());
    const snapped = this.getSnappedTime(beats);
    this.project.playheadPosition.set(snapped);
  }

  onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.workspace.setZoom(this.workspace.zoomX() * zoomFactor);
    } else {
      e.preventDefault();
      this.workspace.setScroll(
        this.workspace.scrollX() + e.deltaX,
        this.workspace.scrollY() + e.deltaY,
      );
    }
  }

  toggleMute(id: string, mute: boolean) {
    this.project.updateTrack(id, { mute });
  }

  toggleSolo(id: string, solo: boolean) {
    this.project.updateTrack(id, { solo });
  }

  toggleAutomation(id: string, showAutomation: boolean) {
    this.project.updateTrack(id, { showAutomation });
  }

  setAutomationParam(id: string, param: "volume" | "pan") {
    this.project.updateTrack(id, { automationParam: param });
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }

  onDropCanvas(e: DragEvent) {
    e.preventDefault();
    const itemName = e.dataTransfer?.getData("text/plain");
    if (!itemName) return;

    // Determine track
    const y = e.offsetY + this.workspace.scrollY();
    const trackIndex = Math.floor(y / 72);

    // Determine time in beats
    const x = e.offsetX + this.workspace.scrollX();
    const beats = Math.max(0, x / this.workspace.zoomX());
    const snappedTime = this.getSnappedTime(beats);

    let tracks = this.project.tracks();

    // If dropped below existing tracks, create a new one
    if (trackIndex >= tracks.length) {
      this.project.addTrack("audio");
      tracks = this.project.tracks();
      // Added to the end, update trackIndex to point to the new one
    }

    const targetTrackId = tracks[Math.min(trackIndex, tracks.length - 1)].id;

    // Add clip
    const newClip = {
      id: "c" + Date.now(),
      name: itemName,
      start: snappedTime,
      duration: 4, // default 1 bar
      offset: 0,
      color: tracks[Math.min(trackIndex, tracks.length - 1)].color,
    };

    const targetTrack = tracks[Math.min(trackIndex, tracks.length - 1)];
    this.project.updateTrack(targetTrackId, {
      clips: [...targetTrack.clips, newClip],
    });
  }
}
