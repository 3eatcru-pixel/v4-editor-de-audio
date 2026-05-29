import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectService } from '../core/project.service';
import { WorkspaceService } from '../core/workspace.service';
import { HistoryService } from '../core/history.service';
import { MidiEngineService } from '../core/midi/midi-engine.service';
import { MidiNote } from '../core/midi/midi-types';
import { AudioEngineService } from '../core/audio-engine.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [MatIconModule, CommonModule],
  template: `
    <header class="h-14 bg-[#08080c] border-b border-[#1a1a24] flex items-center px-4 justify-between shrink-0 z-50 select-none drop-shadow">
      <!-- Left Branding & Menus -->
      <div class="flex items-center gap-6 w-1/3">
        <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-sm bg-gradient-to-br from-[#b82bf2] to-[#06b6d4] flex items-center justify-center shadow-[0_0_10px_rgba(184,43,242,0.4)]">
               <mat-icon class="text-white text-[16px] w-[16px] h-[16px]">waves</mat-icon>
            </div>
            <span class="text-[13px] font-black tracking-tight text-white/90 ml-1 drop-shadow-sm">SONOS</span>
        </div>
        
        <nav class="hidden lg:flex gap-1 text-[11px] font-medium text-[#888] relative">
          <!-- Backdrop Overlay Button to close dropdown when clicking outside -->
          @if (activeMenu) {
            <button class="fixed inset-0 w-full h-full bg-transparent z-30 cursor-default border-none outline-none opacity-0" (click)="activeMenu = null" aria-label="Close active menu"></button>
          }

          <!-- File Menu -->
          <div class="relative z-40">
            <button 
              class="hover:bg-[#161622] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors border-none bg-transparent cursor-pointer"
              [class.bg-[#1a1a24]]="activeMenu === 'file'"
              [class.text-white]="activeMenu === 'file'"
              (click)="activeMenu = activeMenu === 'file' ? null : 'file'"
            >
              File
            </button>
            @if (activeMenu === 'file') {
              <div class="absolute left-0 mt-1.5 w-56 bg-[#0a0a0f] border border-[#1c1c28] rounded shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-left">
                <button (click)="newProject()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px]">insert_drive_file</mat-icon> New Project</span>
                  <span class="text-[9px] text-[#555] font-mono">⌘N</span>
                </button>
                <button (click)="saveProject()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px]">save</mat-icon> Save Project</span>
                  <span class="text-[9px] text-[#555] font-mono">⌘S</span>
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <div class="text-[8px] uppercase tracking-widest text-[#555] px-3 py-0.5 font-bold">Import Demo Projects</div>
                <button (click)="loadSynthwaveDemo()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#b82bf2]">wb_sunny</mat-icon> Synthwave Sunrise (110 BPM)
                </button>
                <button (click)="loadTechnoDemo()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#06b6d4]">electrical_services</mat-icon> Dark Techno Core (132 BPM)
                </button>
                <button (click)="loadAmbientDemo()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#10b981]">nights_stay</mat-icon> Cinematic Ambient (76 BPM)
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <button (click)="triggerExport()" class="w-full text-left px-3 py-1.5 bg-gradient-to-r hover:from-[#b82bf2]/20 hover:to-[#06b6d4]/20 hover:text-white rounded text-[#06b6d4] font-bold flex items-center justify-between border border-[#06b6d4]/10 transition-colors bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px]">audiotrack</mat-icon> Export Mixdown (WAV)</span>
                  <span class="text-[9px] opacity-60 font-mono">⌘E</span>
                </button>
              </div>
            }
          </div>

          <!-- Edit Menu -->
          <div class="relative z-40">
            <button 
              class="hover:bg-[#161622] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors border-none bg-transparent cursor-pointer"
              [class.bg-[#1a1a24]]="activeMenu === 'edit'"
              [class.text-white]="activeMenu === 'edit'"
              (click)="activeMenu = activeMenu === 'edit' ? null : 'edit'"
            >
              Edit
            </button>
            @if (activeMenu === 'edit') {
              <div class="absolute left-0 mt-1.5 w-48 bg-[#0a0a0f] border border-[#1c1c28] rounded shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-left">
                <button (click)="undo()" [disabled]="!history.canUndo()" [class.opacity-45]="!history.canUndo()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] enabled:hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer disabled:cursor-not-allowed">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#06b6d4]">undo</mat-icon> Undo Action
                </button>
                <button (click)="redo()" [disabled]="!history.canRedo()" [class.opacity-45]="!history.canRedo()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] enabled:hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer disabled:cursor-not-allowed">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#06b6d4]">redo</mat-icon> Redo Action
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <button (click)="clearTimeline()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-red-500">layers_clear</mat-icon> Clear Timeline Clips
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <div class="text-[8px] uppercase tracking-widest text-[#555] px-3 py-0.5 font-bold">Tempo Operations</div>
                <button (click)="adjustTempoFactor(0.5)" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">slow_motion_video</mat-icon> Half Speed (0.5x)
                </button>
                <button (click)="adjustTempoFactor(2.0)" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">speed</mat-icon> Double Speed (2.0x)
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <button (click)="transposeAllMidi()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">transform</mat-icon> Transpose MIDI (+2 St)
                </button>
              </div>
            }
          </div>

          <!-- Create Menu -->
          <div class="relative z-40">
            <button 
              class="hover:bg-[#161622] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors border-none bg-transparent cursor-pointer"
              [class.bg-[#1a1a24]]="activeMenu === 'create'"
              [class.text-white]="activeMenu === 'create'"
              (click)="activeMenu = activeMenu === 'create' ? null : 'create'"
            >
              Create
            </button>
            @if (activeMenu === 'create') {
              <div class="absolute left-0 mt-1.5 w-56 bg-[#0a0a0f] border border-[#1c1c28] rounded shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-left">
                <button (click)="addAudioTrack()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#ec4899]">mic</mat-icon> Add Audio Recording Track
                </button>
                <button (click)="addMidiTrack()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px] text-[#06b6d4]">keyboard</mat-icon> Add MIDI Instrument Track
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <div class="text-[8px] uppercase tracking-widest text-[#555] px-3 py-0.5 font-bold">Drum Sequencer Grid</div>
                <button (click)="randomizeSequencer()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px] text-[#10b981]">casino</mat-icon> Inject Random Beats</span>
                  <span class="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded">GEN</span>
                </button>
                <button (click)="clearSequencer()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">grid_off</mat-icon> Reset Drum Sequencer Matrix
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <div class="text-[8px] uppercase tracking-widest text-purple-400 px-3 py-0.5 font-bold">Gemini AI Co-Pilot</div>
                <button (click)="activeModal = 'aiComposer'; activeMenu = null" class="w-full text-left px-3 py-1.5 hover:bg-purple-950/20 hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px] text-purple-400">auto_awesome</mat-icon> AI Creative Music Composer</span>
                  <span class="text-[8px] text-purple-400 font-bold bg-purple-500/10 px-1 rounded">AI</span>
                </button>
              </div>
            }
          </div>

          <!-- View Menu -->
          <div class="relative z-40">
            <button 
              class="hover:bg-[#161622] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors border-none bg-transparent cursor-pointer"
              [class.bg-[#1a1a24]]="activeMenu === 'view'"
              [class.text-white]="activeMenu === 'view'"
              (click)="activeMenu = activeMenu === 'view' ? null : 'view'"
            >
              View
            </button>
            @if (activeMenu === 'view') {
              <div class="absolute left-0 mt-1.5 w-56 bg-[#0a0a0f] border border-[#1c1c28] rounded shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-left">
                <button (click)="toggleBrowser()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px]">folder_special</mat-icon> Sample Browser Sidebar</span>
                  <mat-icon class="text-[14px] w-[14px] h-[14px]" [class.text-[#06b6d4]]="workspace.showBrowser()">{{ workspace.showBrowser() ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                </button>
                <button (click)="toggleBottomPanel()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center justify-between transition-colors border-none bg-transparent cursor-pointer">
                  <span class="flex items-center gap-2"><mat-icon class="text-[13px] w-[13px] h-[13px]">featured_play_list</mat-icon> Sequencer & Mixer Console</span>
                  <mat-icon class="text-[14px] w-[14px] h-[14px]" [class.text-[#06b6d4]]="workspace.showBottomPanel()">{{ workspace.showBottomPanel() ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                </button>
                <div class="h-px bg-[#1a1a24] my-1"></div>
                <button (click)="resetLayout()" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">settings_backup_restore</mat-icon> Reset Workspace Layout
                </button>
              </div>
            }
          </div>

          <!-- Help Menu -->
          <div class="relative z-40">
            <button 
              class="hover:bg-[#161622] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors border-none bg-transparent cursor-pointer"
              [class.bg-[#1a1a24]]="activeMenu === 'help'"
              [class.text-white]="activeMenu === 'help'"
              (click)="activeMenu = activeMenu === 'help' ? null : 'help'"
            >
              Help
            </button>
            @if (activeMenu === 'help') {
              <div class="absolute left-0 mt-1.5 w-48 bg-[#0a0a0f] border border-[#1c1c28] rounded shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-left">
                <button (click)="activeModal = 'shortcuts'; activeMenu = null" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">keyboard_hide</mat-icon> Keyboard Shortcuts
                </button>
                <button (click)="activeModal = 'about'; activeMenu = null" class="w-full text-left px-3 py-1.5 hover:bg-[#161622] hover:text-white rounded text-white/85 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">info</mat-icon> About Sonos studio
                </button>
              </div>
            }
          </div>
        </nav>
      </div>

      <!-- Center Transport & Info -->
      <div class="flex flex-1 items-center justify-center gap-6">
         <!-- Playback Engine Mode Switcher -->
         <div class="flex items-center gap-1 p-0.5 bg-[#0a0a0f] rounded border border-[#1a1a24]/80">
            <button class="px-2 py-1 text-[8px] font-black rounded transition-all uppercase tracking-widest cursor-pointer border-none bg-transparent"
                    [class]="workspace.playbackMode() === 'timeline' ? 'bg-[#06b6d4]/10 text-[#06b6d4] font-black border border-[#06b6d4]/20 shadow-[0_0_6px_rgba(6,182,212,0.15)]' : 'text-[#666] hover:text-[#999]'"
                    (click)="workspace.playbackMode.set('timeline')" title="ARRANGER: Play multi-track linear timeline clips">
              ARRANGER
            </button>
            <button class="px-2 py-1 text-[8px] font-black rounded transition-all uppercase tracking-widest cursor-pointer border-none bg-transparent"
                    [class]="workspace.playbackMode() === 'sequence' ? 'bg-[#b82bf2]/10 text-[#b82bf2] font-black border border-[#b82bf2]/20 shadow-[0_0_6px_rgba(184,43,242,0.15)]' : 'text-[#666] hover:text-[#999]'"
                    (click)="workspace.playbackMode.set('sequence')" title="PATTERN: Play MPC step rhythm sequencer loops">
              PATTERN
            </button>
            <button class="px-2 py-1 text-[8px] font-black rounded transition-all uppercase tracking-widest cursor-pointer border-none bg-transparent"
                    [class]="workspace.playbackMode() === 'clip' ? 'bg-[#eab308]/10 text-[#eab308] font-black border border-[#eab308]/20 shadow-[0_0_6px_rgba(234,179,8,0.15)]' : 'text-[#666] hover:text-[#999]'"
                    (click)="workspace.playbackMode.set('clip')" title="CLIP: Loop solo selected active sample">
              CLIP
            </button>
         </div>

         <div class="flex items-center gap-1.5 p-1 bg-[#121218] rounded-md border border-[#1a1a24] shadow-inner">
            <button class="w-7 h-7 rounded text-[#888] hover:text-white hover:bg-[#232332] flex items-center justify-center transition-colors border-none bg-transparent cursor-pointer" (click)="project.playheadPosition.set(0)" aria-label="Skip to start">
               <mat-icon class="text-[18px] w-[18px] h-[18px]">skip_previous</mat-icon>
            </button>
            <button class="w-8 h-8 rounded flex items-center justify-center transition-all shadow-sm border-none cursor-pointer"
                    [class]="project.isPlaying() ? 'bg-[#b82bf2] hover:bg-[#c93cff] shadow-[#b82bf2]/40 text-white' : 'text-white bg-[#2a2a35] hover:bg-[#3a3a45]'"
                    (click)="project.togglePlay()" aria-label="Play or pause">
               <mat-icon class="text-[20px] w-[20px] h-[20px] ml-0.5">{{ project.isPlaying() ? 'pause' : 'play_arrow' }}</mat-icon>
            </button>
            <button class="w-7 h-7 rounded text-[#888] hover:text-white hover:bg-[#232332] flex items-center justify-center transition-colors border-none bg-transparent cursor-pointer" (click)="project.stop()" aria-label="Stop playback">
               <mat-icon class="text-[18px] w-[18px] h-[18px]">stop</mat-icon>
            </button>
            <button class="w-7 h-7 rounded text-red-500/70 hover:text-red-400 hover:bg-[#1a1a24] flex items-center justify-center transition-colors mx-1 border border-transparent hover:border-red-500/30 bg-transparent cursor-pointer" aria-label="Record clip input">
               <mat-icon class="text-[14px] w-[14px] h-[14px]">fiber_manual_record</mat-icon>
            </button>
         </div>

         <div class="flex items-center gap-4 bg-[#0a0a0f] border border-[#1a1a24] rounded px-4 py-1.5 shadow-[inset_0_1px_4px_rgba(0,0,0,0.6)]">
            <span class="text-xl font-mono text-[#06b6d4] w-24 text-center tracking-tight">{{ formatTime(project.playheadPosition()) }}</span>
            <div class="w-px h-6 bg-[#2a2a35]/50"></div>
            
            <div class="flex items-center gap-4 opacity-85">
               <!-- Editable Bar -->
               <button type="button" class="flex flex-col cursor-pointer hover:text-white transition-colors group relative border-none bg-transparent text-left outline-none" (click)="startBarEdit()">
                  <span class="text-[8px] uppercase tracking-widest text-[#656575] flex items-center gap-0.5">
                     Bar 
                     <mat-icon class="text-[8px] w-2 h-2 opacity-0 group-hover:opacity-100 text-white/80 transition-opacity">edit</mat-icon>
                  </span>
                  @if (isEditingBar()) {
                     <input
                        #barInput
                        type="number"
                        min="1"
                        max="999"
                        [value]="Math.floor(project.playheadPosition() / 4 + 1)"
                        (blur)="stopBarEdit(barInput.value)"
                        (keydown.enter)="stopBarEdit(barInput.value); barInput.blur()"
                        (click)="$event.stopPropagation()"
                        class="bg-[#121218] border border-white/30 text-[11px] font-mono text-white/95 w-10 px-1 py-0.5 rounded outline-none select-text"
                     />
                  } @else {
                     <span class="text-[11px] font-mono text-white/90">{{ getBar() }}</span>
                  }
               </button>
               <!-- Editable Beat -->
               <button type="button" class="flex flex-col cursor-pointer hover:text-white transition-colors group relative border-none bg-transparent text-left outline-none" (click)="startBeatEdit()">
                  <span class="text-[8px] uppercase tracking-widest text-[#656575] flex items-center gap-0.5">
                     Beat 
                     <mat-icon class="text-[8px] w-2 h-2 opacity-0 group-hover:opacity-100 text-white/80 transition-opacity">edit</mat-icon>
                  </span>
                  @if (isEditingBeat()) {
                     <input
                        #beatInput
                        type="number"
                        min="1"
                        max="4"
                        [value]="Math.floor(project.playheadPosition() % 4 + 1)"
                        (blur)="stopBeatEdit(beatInput.value)"
                        (keydown.enter)="stopBeatEdit(beatInput.value); beatInput.blur()"
                        (click)="$event.stopPropagation()"
                        class="bg-[#121218] border border-white/30 text-[11px] font-mono text-white/95 w-10 px-1 py-0.5 rounded outline-none select-text"
                     />
                  } @else {
                     <span class="text-[11px] font-mono text-white/90">{{ getBeat() }}</span>
                  }
               </button>
               <div class="w-px h-6 bg-[#2a2a35]/50 mx-1"></div>
               <!-- Editable Tempo/BPM -->
               <button type="button" class="flex flex-col cursor-pointer transition-colors group relative border-none bg-transparent text-left outline-none" (click)="startBpmEdit()" (wheel)="$event.preventDefault(); adjustBpm($event)">
                  <span class="text-[8px] uppercase tracking-widest text-[#656575] flex items-center gap-0.5">
                     Tempo
                     <mat-icon class="text-[8px] w-2 h-2 opacity-0 group-hover:opacity-100 text-[#10b981] transition-opacity">edit</mat-icon>
                  </span>
                  @if (isEditingBpm()) {
                     <input
                        #bpmInput
                        type="number"
                        min="20"
                        max="300"
                        step="1"
                        [value]="project.bpm()"
                        (blur)="stopBpmEdit(bpmInput.value)"
                        (keydown.enter)="stopBpmEdit(bpmInput.value); bpmInput.blur()"
                        (click)="$event.stopPropagation()"
                        class="bg-[#121218] border border-[#10b981] text-[11px] font-mono text-[#10b981] w-14 px-1 py-0.5 rounded outline-none select-text"
                     />
                  } @else {
                     <span class="text-[11px] font-mono text-[#10b981]">{{ project.bpm() | number:'1.2-2' }}</span>
                  }
               </button>
               <div class="flex flex-col mr-1">
                  <span class="text-[8px] uppercase tracking-widest text-[#666]">Sig</span>
                  <span class="text-[11px] font-mono text-white/90">4/4</span>
               </div>
            </div>
         </div>
      </div>

      <!-- Right Master VU Slider and Link indicators -->
      <div class="flex items-center justify-end gap-6 w-1/3 text-[#888]">
         <div class="flex items-center gap-2 text-[9px] font-bold">
             <button 
                type="button"
                (click)="toggleMidi()" 
                class="px-2 py-1 rounded transition-colors border cursor-pointer select-none"
                [class]="isMidiActive() ? 'text-[#a855f7] bg-[#a855f7]/10 border-[#a855f7]/30 shadow-[0_0_8px_rgba(168,85,247,0.2)]' : 'text-white/50 bg-[#161620] border-[#1a1a24] hover:text-white'"
             >
                MIDI
             </button>
             <button 
                type="button"
                (click)="toggleLink()" 
                class="px-2 py-1 rounded transition-colors border cursor-pointer select-none"
                [class]="isLinkActive() ? 'text-[#06b6d4] bg-[#06b6d4]/10 border-[#06b6d4]/30 shadow-[0_0_8px_rgba(6,182,212,0.2)]' : 'text-white/50 bg-[#161620] border-[#1a1a24] hover:text-white'"
             >
                LINK
             </button>
         </div>
         <div class="w-24 h-1 bg-[#1a1a24] rounded-full overflow-hidden flex items-center relative shadow-inner">
            <div class="h-full bg-gradient-to-r from-[#b82bf2] via-[#06b6d4] to-[#10b981] w-[80%] rounded-full"></div>
            <div class="absolute w-[2px] h-2 bg-white shadow left-[80%] rounded"></div>
         </div>
      </div>
    </header>

    <!-- Overlays & Modals -->
    
    <!-- Keyboard Shortcuts Modal -->
    @if (activeModal === 'shortcuts') {
      <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
        <div class="bg-[#0b0b10] border border-[#1c1c28] rounded-lg max-w-sm w-full p-5 shadow-2xl relative select-text">
          <button (click)="activeModal = null" class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors border-none bg-transparent cursor-pointer" aria-label="Close modal">
            <mat-icon class="text-[18px] w-[18px] h-[18px]">close</mat-icon>
          </button>
          <h3 class="text-xs font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2 border-b border-[#1a1a24] pb-2">
            <mat-icon class="text-[#06b6d4] text-[16px] w-[16px] h-[16px]">keyboard_hide</mat-icon> Keyboard Shortcuts
          </h3>
          <div class="flex flex-col gap-1.5 text-[11px] text-[#a0a0b0]">
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Toggle Playback</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Spacebar</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Delete Selected Clip</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Del / Backspace</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Duplicate Selected Clip</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">D</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Toggle Clip Mute</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">M</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Timeline Zoom</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Ctrl + Msg Wheel</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Timeline Zoom Button</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Canvas Zoom In/Out</kbd>
            </div>
            <div class="flex justify-between items-center py-1 border-b border-[#111116]">
              <span>Drag BPM / Tempo</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Mouse Wheel On BPM</kbd>
            </div>
            <div class="flex justify-between items-center py-1">
              <span>Cycle Track Colors</span>
              <kbd class="px-2 py-0.5 bg-[#161622] text-white border border-[#232332] rounded font-mono font-bold text-[9px]">Click Dot Accent</kbd>
            </div>
          </div>
          <button (click)="activeModal = null" class="mt-5 w-full py-2 bg-[#232332] text-white rounded hover:bg-[#2c2c3e] transition-colors font-bold text-xs uppercase tracking-widest border-none cursor-pointer">
            Close Panel
          </button>
        </div>
      </div>
    }

    <!-- About Modal -->
    @if (activeModal === 'about') {
      <div class="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in font-sans">
        <div class="bg-[#0b0b10] border border-[#1c1c28] rounded-xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden select-text">
          <!-- Ambient Gloom -->
          <div class="absolute -top-12 -left-12 w-32 h-32 bg-[#b82bf2]/10 rounded-full blur-2xl pointer-events-none"></div>
          <div class="absolute -bottom-12 -right-12 w-32 h-32 bg-[#06b6d4]/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <button (click)="activeModal = null" class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10 border-none bg-transparent cursor-pointer" aria-label="Close modal">
            <mat-icon class="text-[18px] w-[18px] h-[18px]">close</mat-icon>
          </button>
          
          <div class="flex flex-col items-center text-center mt-2 relative z-10">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#b82bf2] to-[#06b6d4] flex items-center justify-center shadow-[0_0_20px_rgba(184,43,242,0.5)] mb-3">
              <mat-icon class="text-white text-[24px] w-[24px] h-[24px]">waves</mat-icon>
            </div>
            <h2 class="text-sm font-black tracking-widest text-white uppercase font-sans">SONOS STUDIO DAW</h2>
            <p class="text-[9px] uppercase tracking-widest text-[#06b6d4] font-bold mt-1">Zoneless Framework Edition</p>
            
            <p class="text-[11px] text-[#a0a0b0] mt-4 leading-relaxed px-1 font-sans">
              A high-precision, interactive browser DAW built on Angular and Tone.js synthesis lines. Features real-time offline bounces, multi-track channels, volume automation lanes, and drum sequencers.
            </p>
            
            <div class="grid grid-cols-2 gap-2 w-full mt-5 text-[9px] text-[#666]">
              <div class="bg-[#121218] p-2 rounded border border-[#1c1c28]">
                 <span class="block text-white font-bold text-center">Audio Clock</span>
                 <span class="block text-center mt-0.5 font-mono">Tone.js Core</span>
              </div>
              <div class="bg-[#121218] p-2 rounded border border-[#1c1c28]">
                 <span class="block text-white font-bold text-center">UI Engine</span>
                 <span class="block text-center mt-0.5 font-mono">Angular 21 + Tail 4</span>
              </div>
            </div>
            
            <button (click)="activeModal = null" class="mt-5 w-full py-2 bg-gradient-to-r from-[#b82bf2] to-[#06b6d4] hover:opacity-95 text-white rounded transition-all font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#b82bf2]/20 border-none cursor-pointer">
              Resume Synthesis
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Audio Bounce / Offline Exporting Mixdown Modal -->
    @if (activeModal === 'export') {
      <div class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in font-sans">
        <div class="bg-[#0b0b10] border border-[#232332] rounded-xl max-w-xs w-full p-5 shadow-2xl relative text-center">
          <div class="w-10 h-10 bg-[#06b6d4]/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-[#06b6d4]/20">
            <mat-icon class="text-[#06b6d4] animate-spin text-[18px] w-[18px] h-[18px]">sync</mat-icon>
          </div>
          <h3 class="text-xs font-bold text-white mb-1 uppercase tracking-wider">Rendering Audio Mixdown...</h3>
          <p class="text-[10px] text-[#555] mb-4">Exporting stereo 24-bit 48kHz WAV buffer.</p>
          
          <div class="w-full bg-[#121218] h-1 rounded-full overflow-hidden mb-3 border border-[#1a1a24]">
             <div class="bg-gradient-to-r from-[#b82bf2] to-[#06b6d4] h-full transition-all duration-75" [style.width.%]="exportProgress"></div>
          </div>
          <div class="flex justify-between items-center font-mono text-[9px] text-[#555]">
            <span>Bounce Offline</span>
            <span class="text-white font-bold">{{ exportProgress }}%</span>
          </div>
        </div>
      </div>
    }

    <!-- Gemini AI Co-Pilot Composer Modal -->
    @if (activeModal === 'aiComposer') {
      <div class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in font-sans">
        <div class="bg-[#0b0b10] border border-[#232332] rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-left">
          <button (click)="activeModal = null" class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors border-none bg-transparent cursor-pointer" aria-label="Close modal">
            <mat-icon class="text-[18px]">close</mat-icon>
          </button>

          <!-- Header -->
          <div class="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#1b1b26]">
            <div class="w-8 h-8 rounded bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
              <mat-icon class="text-[18px]">auto_awesome</mat-icon>
            </div>
            <div>
              <h3 class="text-xs font-bold text-white uppercase tracking-wider">Gemini Co-Pilot AI Composer</h3>
              <p class="text-[10px] text-zinc-400">Generate professional beats, grooves, and chord progressions directly into your active tracks.</p>
            </div>
          </div>

          @if (!isAiGenerating()) {
            <!-- Form -->
            <div class="flex flex-col gap-4">
              <!-- Preset Prompts -->
              <div>
                <span class="text-[9px] font-mono text-[#a855f7] uppercase tracking-widest block mb-1.5 font-bold">Select Genre / Mood Inspiration</span>
                <div class="grid grid-cols-2 gap-2">
                  <button (click)="setAiPreset('Cyberpunk Industrial Beat', 'both')" class="py-1.5 px-2 bg-purple-950/20 border border-purple-900/30 text-purple-300 text-[10px] rounded hover:bg-purple-900/40 text-left truncate cursor-pointer select-none">
                    Cyberpunk Beat & Synth
                  </button>
                  <button (click)="setAiPreset('Chill Lo-fi Soul chords and lazy drum grooves in A Minor', 'both')" class="py-1.5 px-2 bg-cyan-950/20 border border-cyan-900/30 text-cyan-300 text-[10px] rounded hover:bg-cyan-900/40 text-left truncate cursor-pointer select-none">
                    Chill Lofi Groove
                  </button>
                  <button (click)="setAiPreset('Minimal Tech House four-on-the-floor groove', 'beats')" class="py-1.5 px-2 bg-emerald-950/20 border border-emerald-900/30 text-emerald-300 text-[10px] rounded hover:bg-emerald-900/40 text-left truncate cursor-pointer select-none">
                    Tech House Beat Grid
                  </button>
                  <button (click)="setAiPreset('Synthwave Retro arpeggiated bassline melody', 'melody')" class="py-1.5 px-2 bg-orange-950/20 border border-orange-900/30 text-orange-300 text-[10px] rounded hover:bg-orange-900/40 text-left truncate cursor-pointer select-none">
                    Retro Synthwave Bassline
                  </button>
                </div>
              </div>

              <!-- Input Area -->
              <div class="flex flex-col gap-1">
                <span class="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Custom Creative Prompt</span>
                <textarea 
                  [value]="aiPrompt()" 
                  (input)="onPromptInput($any($event.target).value)"
                  placeholder="Describe your musical ideas in detail (e.g. 'Generate a driving 128bpm melodic house drop with snappy hihats and a simple minor pentatonic lead...')"
                  class="bg-[#121218] border border-[#232332] text-white rounded p-3 text-xs focus:border-purple-500 outline-none resize-none h-20 leading-relaxed placeholder:text-zinc-600 font-sans"
                ></textarea>
              </div>

              <!-- Selection Target -->
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <span class="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Target Workspace</span>
                  <select 
                    [value]="aiTarget()" 
                    (change)="aiTarget.set($any($event.target).value)" 
                    class="bg-[#121218] text-white border border-[#232332] rounded p-2 text-xs outline-none cursor-pointer focus:border-purple-500"
                  >
                    <option value="both">Both (1 & 2. Beats + Melody)</option>
                    <option value="beats">1. Drum Sequencer Only (Beats)</option>
                    <option value="melody">2. Piano Roll Only (Melody)</option>
                  </select>
                </div>

                <div class="flex flex-col gap-1.5 justify-end">
                  <button 
                    (click)="triggerAiCoPilotGeneration()"
                    class="py-2.5 bg-gradient-to-r from-[#b82bf2] to-[#06b6d4] hover:opacity-95 text-white rounded transition-all font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#b82bf2]/20 border-none cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <mat-icon class="text-[14px] w-[14px] h-[14px]">auto_awesome</mat-icon>
                    Compose with Gemini
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <!-- Loading State -->
            <div class="flex flex-col items-center justify-center py-6 text-center">
              <div class="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mb-4 border border-purple-500/25 relative">
                <mat-icon class="text-purple-400 animate-spin text-[24px] w-[24px] h-[24px]">sync</mat-icon>
                <div class="absolute -inset-1 rounded-full border border-purple-500/20 animate-ping"></div>
              </div>
              <h3 class="text-xs font-bold text-white mb-2 uppercase tracking-widest">Co-Pilot Composition Engine</h3>
              <p class="text-[11px] text-zinc-400 font-mono italic max-w-sm">"{{ aiStatusMessage() }}"</p>
              <span class="text-[9px] text-zinc-600 font-mono tracking-widest uppercase mt-4">Applying generative MIDI transformations...</span>
            </div>
          }
        </div>
      </div>
    }

    <!-- Toast Notification Popup -->
    @if (toast) {
      <div class="fixed bottom-14 right-6 bg-[#08080f]/95 border-l-4 border-l-[#06b6d4] border border-[#1c1c28] rounded p-3.5 shadow-2xl z-50 max-w-sm w-full animate-slide-in backdrop-blur-sm flex gap-3 select-none text-left">
        <div class="w-5 h-5 rounded bg-[#06b6d4]/10 flex items-center justify-center text-[#06b6d4] shrink-0 mt-0.5">
          <mat-icon class="text-[13px] w-[13px] h-[13px]">info</mat-icon>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-bold text-white truncate">{{ toast.title }}</h4>
          <p class="text-[10px] text-[#888] mt-0.5 leading-normal">{{ toast.desc }}</p>
        </div>
        <button (click)="toast = null" class="text-[#444] hover:text-white transition-colors shrink-0 flex items-start border-none bg-transparent cursor-pointer" aria-label="Dismiss notification">
          <mat-icon class="text-[13px] w-[13px] h-[13px]">close</mat-icon>
        </button>
      </div>
    }

    <style>
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in {
        animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .animate-slide-in {
        animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    </style>
  `
})
export class TopBarComponent {
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);
  history = inject(HistoryService);
  audio = inject(AudioEngineService);

  constructor() {
    effect(() => {
      const t = this.workspace.toast();
      if (t) {
        this.showToast(t.title, t.desc);
        // Clear workspace toast signal so same notification can trigger again
        setTimeout(() => {
          this.workspace.toast.set(null);
        }, 50);
      }
    });

    effect(() => {
      const trig = this.workspace.aiTrigger();
      if (trig) {
        this.aiTarget.set(trig.target);
        if (trig.defaultPrompt) {
          this.aiPrompt.set(trig.defaultPrompt);
        }
        this.activeModal = 'aiComposer';
        this.activeMenu = null;
        // Reset trigger
        setTimeout(() => {
          this.workspace.aiTrigger.set(null);
        }, 50);
      }
    });
  }

  isEditingBpm = signal(false);
  isEditingBar = signal(false);
  isEditingBeat = signal(false);
  Math = Math;

  startBpmEdit() {
    this.isEditingBpm.set(true);
  }

  stopBpmEdit(val: string) {
    this.isEditingBpm.set(false);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      this.project.bpm.set(Math.max(20, Math.min(300, parsed)));
    }
  }

  startBarEdit() {
    this.isEditingBar.set(true);
  }

  stopBarEdit(val: string) {
    this.isEditingBar.set(false);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      const targetBar = Math.max(1, Math.min(999, parsed));
      const currentBeat = this.project.playheadPosition() % 4;
      this.project.playheadPosition.set((targetBar - 1) * 4 + currentBeat);
    }
  }

  startBeatEdit() {
    this.isEditingBeat.set(true);
  }

  stopBeatEdit(val: string) {
    this.isEditingBeat.set(false);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      const targetBeat = Math.max(1, Math.min(4, parsed));
      const currentBar = Math.floor(this.project.playheadPosition() / 4);
      this.project.playheadPosition.set(currentBar * 4 + (targetBeat - 1));
    }
  }

  midiEngine = inject(MidiEngineService);

  // AI Co-Pilot State
  aiPrompt = signal<string>('Chill Lo-fi Soul chords and lazy drum grooves in A Minor');
  aiTarget = signal<'beats' | 'melody' | 'both'>('both');
  isAiGenerating = signal<boolean>(false);
  aiStatusMessage = signal<string>('Contacting Gemini master composer...');

  setAiPreset(prompt: string, target: 'beats' | 'melody' | 'both') {
    this.aiPrompt.set(prompt);
    this.aiTarget.set(target);
  }

  onPromptInput(val: string) {
    this.aiPrompt.set(val);
  }

  async triggerAiCoPilotGeneration() {
    this.isAiGenerating.set(true);
    this.aiStatusMessage.set('Deconstructing beat sequences with Gemini-3.5-flash...');

    // Dynamic cute AI messages
    const statusMessages = [
      'Deconstructing beat sequences with Gemini-3.5-flash...',
      'Synthesizing synthetic drum trigger envelopes...',
      'Mapping chord progression degrees to Minor Pentatonic...',
      'Quantizing microtime sub-ticks with 960 PPQ resolution...',
      'Finalizing musical arrangements and MIDI velocities...'
    ];
    let msgIdx = 0;
    const interval = setInterval(() => {
      this.aiStatusMessage.set(statusMessages[++msgIdx % statusMessages.length]);
    }, 1200);

    try {
      const response = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: this.aiPrompt(), target: this.aiTarget() })
      });

      clearInterval(interval);

      if (!response.ok) {
        throw new Error('Server returned generation error');
      }

      const data = await response.json();
      
      // Update BPM if suggested
      if (data.bpm) {
        this.project.bpm.set(data.bpm);
      }

      // 1. Load sequence beats
      if ((this.aiTarget() === 'both' || this.aiTarget() === 'beats') && data.sequence && Array.isArray(data.sequence)) {
        this.project.sequence.update((oldSeq) => {
          return oldSeq.map(row => {
            const match = data.sequence.find((x: { instrument?: string; steps?: boolean[] }) => x.instrument?.toLowerCase() === row.instrument?.toLowerCase());
            if (match && Array.isArray(match.steps)) {
              const len = row.steps.length;
              const fixedSteps = Array(len).fill(false);
              for (let i = 0; i < len; i++) {
                if (match.steps[i] !== undefined) {
                  fixedSteps[i] = !!match.steps[i];
                }
              }
              return {
                ...row,
                steps: fixedSteps
              };
            }
            return row;
          });
        });
      }

      // 2. Load piano notes
      if ((this.aiTarget() === 'both' || this.aiTarget() === 'melody') && data.pianoNotes && Array.isArray(data.pianoNotes)) {
        const cleanNotes: MidiNote[] = data.pianoNotes.map((noteObj: { note?: number; velocity?: number; startTick?: number; lengthTick?: number }, index: number) => {
          return {
            id: 'note_ai_' + Date.now() + '_' + index,
            note: typeof noteObj.note === 'number' ? noteObj.note : 60,
            velocity: typeof noteObj.velocity === 'number' ? noteObj.velocity : 100,
            startTick: typeof noteObj.startTick === 'number' ? noteObj.startTick : 0,
            lengthTick: typeof noteObj.lengthTick === 'number' ? noteObj.lengthTick : 480,
            channel: 1
          };
        });

        const clipId = this.workspace.selectedClipId() || this.midiEngine.activeClipId();
        const activeClip = this.midiEngine.getOrCreateClip(clipId);
        activeClip.notes = cleanNotes;
        this.midiEngine.midiClips().set(clipId, activeClip);
        this.midiEngine.midiClips.set(new Map(this.midiEngine.midiClips()));

        // Keep workspace.pianoNotes synchronized with the newly generated melody/notes for retro-compat sequencers
        const transformedWorkspaceNotes = cleanNotes.map(n => {
          const pitch = n.note;
          // P = pitch. We have C4 = 60 (y = 0), C3 = 48 (y = 288) -> y = (60 - pitch) * 24
          const y = (60 - pitch) * 24;
          const x = (n.startTick / 240) * 32;
          const w = (n.lengthTick / 240) * 32;
          return {
            id: n.id,
            x: Math.max(0, x),
            y: Math.max(0, Math.min(288, y)),
            w: Math.max(16, w),
            h: 24
          };
        });
        this.workspace.pianoNotes.set(transformedWorkspaceNotes);
      }

      this.showToast('AI Composition Complete', 'New high-fidelity pattern structures injected successfully.');
      this.activeModal = null;
    } catch (err: unknown) {
      clearInterval(interval);
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Error occurred during AI generation';
      this.showToast('Composition Failed', errMsg);
    } finally {
      this.isAiGenerating.set(false);
    }
  }

  // MIDI & LINK controllers state
  isMidiActive = signal(false);
  isLinkActive = signal(true);

  toggleMidi() {
    this.isMidiActive.update(v => !v);
    if (this.isMidiActive()) {
      this.showToast('MIDI Keyboard Enabled', 'Virtual keys connected. Ready to capture MIDI input notes.');
    } else {
      this.showToast('MIDI Keyboard Disabled', 'Virtual controller inputs offline.');
    }
  }

  toggleLink() {
    this.isLinkActive.update(v => !v);
    if (this.isLinkActive()) {
      this.showToast('Ableton Link Synced', 'Shared session active. Aligning grids synchronously.');
    } else {
      this.showToast('Ableton Link Disabled', 'Sync offline. Defaulting to internal high-precision master clocks.');
    }
  }

  // Menu, Modal and Toast State
  activeMenu: 'file' | 'edit' | 'create' | 'view' | 'help' | null = null;
  activeModal: 'shortcuts' | 'about' | 'export' | 'aiComposer' | null = null;
  exportProgress = 0;
  exportInterval: ReturnType<typeof setInterval> | null = null;
  toastTimeout: ReturnType<typeof setTimeout> | null = null;

  toast: { title: string; desc: string } | null = null;

  showToast(title: string, desc: string) {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toast = { title, desc };
    this.toastTimeout = setTimeout(() => {
      this.toast = null;
    }, 4500);
  }

  // --- File Actions ---
  
  newProject() {
    this.project.bpm.set(120);
    this.project.playheadPosition.set(0);
    this.project.stop();
    
    const cleanTracks = this.project.tracks().map(t => ({ ...t, clips: [] }));
    this.project.tracks.set(cleanTracks);
    
    this.project.sequence.update(seq => {
      return seq.map(row => ({ ...row, steps: Array(17).fill(false) }));
    });
    
    this.showToast('New Project Created', 'Existing clips cleared. Sequencer beat matrix resets to blank.');
    this.activeMenu = null;
  }

  saveProject() {
    const projectData = {
      bpm: this.project.bpm(),
      tracks: this.project.tracks(),
      sequence: this.project.sequence(),
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('sonos_daw_project', JSON.stringify(projectData));
      const d = new Date();
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      this.showToast('Workspace Saved', `Stored tracks hierarchy in local browser secure partition at ${timeStr}.`);
    } catch {
      this.showToast('Save Failed', 'Unable to execute storage commit on this browser sandbox.');
    }
    this.activeMenu = null;
  }

  loadSynthwaveDemo() {
    this.project.bpm.set(110);
    this.project.playheadPosition.set(0);
    
    // Set drum matrix
    this.project.sequence.update((seq) => {
      return seq.map(row => {
        let steps = Array(17).fill(false);
        if (row.instrument === 'Kick') {
          steps = [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false, false];
        } else if (row.instrument === 'Snare') {
          steps = [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false, false];
        } else if (row.instrument === 'HiHat') {
          steps = [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, false];
        }
        return { ...row, steps };
      });
    });

    // Populate timeline channels
    const tracks = this.project.tracks().map(t => {
      let clips: { id: string; start: number; duration: number; offset: number; color: string; name: string }[] = [];
      if (t.name === 'Drums') {
        clips = [
          { id: 'sw1', start: 0, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' },
          { id: 'sw2', start: 16, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' },
          { id: 'sw3', start: 32, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' },
          { id: 'sw4', start: 48, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' }
        ];
      } else if (t.name === 'Bass') {
        clips = [
          { id: 'swb1', start: 0, duration: 32, offset: 0, color: t.color, name: 'Sub 808' },
          { id: 'swb2', start: 32, duration: 32, offset: 0, color: t.color, name: 'Acid 303' }
        ];
      } else if (t.name === 'Keys') {
        clips = [
          { id: 'swk1', start: 0, duration: 64, offset: 0, color: t.color, name: 'DX7 E-Piano' }
        ];
      } else if (t.name === 'Lead') {
        clips = [
          { id: 'swl1', start: 16, duration: 32, offset: 0, color: t.color, name: 'Saw Lead' }
        ];
      } else if (t.name === 'Vocals') {
        clips = [
          { id: 'swv1', start: 32, duration: 16, offset: 0, color: t.color, name: 'Vox 1' }
        ];
      }
      return { ...t, clips };
    });
    this.project.tracks.set(tracks);
    
    this.showToast('Synthwave Demo Loaded', 'Timeline populated and Tempo set to 110 BPM.');
    this.activeMenu = null;
  }

  loadTechnoDemo() {
    this.project.bpm.set(132);
    this.project.playheadPosition.set(0);
    
    this.project.sequence.update((seq) => {
      return seq.map(row => {
        let steps = Array(17).fill(false);
        if (row.instrument === 'Kick') {
          steps = [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false, false];
        } else if (row.instrument === 'Clap') {
          steps = [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false, false];
        } else if (row.instrument === 'HiHat') {
          steps = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false];
        }
        return { ...row, steps };
      });
    });

    const tracks = this.project.tracks().map(t => {
      let clips: { id: string; start: number; duration: number; offset: number; color: string; name: string }[] = [];
      if (t.name === 'Drums') {
        clips = [
          { id: 'tc1', start: 0, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' },
          { id: 'tc2', start: 16, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' },
          { id: 'tc3', start: 32, duration: 16, offset: 0, color: t.color, name: 'Drums_120bpm' }
        ];
      } else if (t.name === 'Bass') {
        clips = [
          { id: 'tcb1', start: 0, duration: 48, offset: 0, color: t.color, name: 'Moog Pluck' }
        ];
      } else if (t.name === 'Lead') {
        clips = [
          { id: 'tcl1', start: 16, duration: 32, offset: 0, color: t.color, name: 'Trance Lead' }
        ];
      }
      return { ...t, clips };
    });
    this.project.tracks.set(tracks);

    this.showToast('Techno Demo Loaded', 'BPM locked to 132. Deep driving sub pluck synthesis initialized.');
    this.activeMenu = null;
  }

  loadAmbientDemo() {
    this.project.bpm.set(76);
    this.project.playheadPosition.set(0);

    const tracks = this.project.tracks().map(t => {
      let clips: { id: string; start: number; duration: number; offset: number; color: string; name: string }[] = [];
      if (t.name === 'Keys') {
        clips = [
          { id: 'amk1', start: 0, duration: 64, offset: 0, color: t.color, name: 'Upright Piano' }
        ];
      } else if (t.name === 'Lead') {
        clips = [
          { id: 'aml1', start: 16, duration: 48, offset: 0, color: t.color, name: 'Sine Glide' }
        ];
      } else if (t.name === 'Vocals') {
        clips = [
          { id: 'amv1', start: 0, duration: 64, offset: 0, color: t.color, name: 'Vox Ahh' }
        ];
      }
      return { ...t, clips };
    });
    this.project.tracks.set(tracks);

    this.showToast('Cinematic Ambient Loaded', 'Slow drone tempos initialized at 76 BPM.');
    this.activeMenu = null;
  }

  async triggerExport() {
    this.activeModal = 'export';
    this.exportProgress = 20;
    this.activeMenu = null;
    
    try {
      this.exportProgress = 45;
      const wavBlob = await this.audio.exportProjectWav();
      this.exportProgress = 85;
      
      this.exportProgress = 100;
      setTimeout(() => {
        this.activeModal = null;
        this.showToast('Mixdown Export Complete', 'A high-fidelity stereo WAV file has been rendered and queued for download.');
        
        try {
          const url = URL.createObjectURL(wavBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Sonos_Mixdown_Bounce_${Math.floor(Date.now() / 1000)}.wav`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (ex) {
          console.warn("Blob download navigation block averted:", ex);
        }
      }, 600);
    } catch (e) {
      console.error("Offline bounce render error:", e);
      this.exportProgress = 0;
      this.activeModal = null;
      this.showToast('Export Failed', 'An error occurred during high-fidelity bounce rendering.');
    }
  }

  downloadWavFile() {
    // Deprecated in favor of direct state integration inside triggerExport()
  }

  // --- Edit Actions ---

  undo() {
    const res = this.history.undo();
    if (res) {
      this.showToast('Undo Successful', 'Reverted timeline and notes changes to the previous state.');
    } else {
      this.showToast('Nothing to Undo', 'No previous history checkpoints are available.');
    }
    this.activeMenu = null;
  }

  redo() {
    const res = this.history.redo();
    if (res) {
      this.showToast('Redo Successful', 'Re-applied the previously undone step.');
    } else {
      this.showToast('Nothing to Redo', 'No future history checkpoints are available to re-apply.');
    }
    this.activeMenu = null;
  }
  
  clearTimeline() {
    const emptyTracks = this.project.tracks().map(t => ({ ...t, clips: [] }));
    this.project.tracks.set(emptyTracks);
    this.showToast('Timeline Cleared', 'All audio/midi clips removed. Drum sequencer retained.');
    this.activeMenu = null;
  }

  adjustTempoFactor(factor: number) {
    const current = this.project.bpm();
    const target = Math.max(20, Math.min(300, Math.round(current * factor)));
    this.project.bpm.set(target);
    this.showToast('Tempo Adjusted', `Project BPM is scale-altered to ${target} BPM.`);
    this.activeMenu = null;
  }

  transposeAllMidi() {
    this.workspace.pianoNotes.update(notes => {
      return notes.map(n => {
        // Vertical grid index represents keys. Moving UP (towards higher pitch) reduces y.
        // Each key is 24px tall. Moving up 2 keys is -48px.
        const newY = Math.max(0, Math.min(24 * 12, n.y - 48));
        return { ...n, y: newY };
      });
    });
    this.showToast('MIDI Pitch Shifted', 'Shifted piano grids and MIDI elements +2 semitones.');
    this.activeMenu = null;
  }

  // --- Create Actions ---

  addAudioTrack() {
    this.project.addTrack('audio');
    this.showToast('Audio Track Appended', 'New vocal or sample channel added.');
    this.activeMenu = null;
  }

  addMidiTrack() {
    this.project.addTrack('midi');
    this.showToast('MIDI Track Appended', 'New micro-synth controller track added.');
    this.activeMenu = null;
  }

  randomizeSequencer() {
    this.project.sequence.update((seq) => {
      return seq.map(row => {
        return {
          ...row,
          steps: Array(17).fill(false).map(() => Math.random() > 0.65)
        };
      });
    });
    this.showToast('Beats Generated', 'Grid steps populated with instant generative rhythmic triggers.');
    this.activeMenu = null;
  }

  clearSequencer() {
    this.project.sequence.update((seq) => {
      return seq.map(row => ({ ...row, steps: Array(17).fill(false) }));
    });
    this.showToast('Sequencer Cleared', 'Empty drum master trigger matrix.');
    this.activeMenu = null;
  }

  // --- View Actions ---

  toggleBrowser() {
    this.workspace.showBrowser.update(v => !v);
  }

  toggleBottomPanel() {
    this.workspace.showBottomPanel.update(v => !v);
  }

  resetLayout() {
    this.workspace.showBrowser.set(true);
    this.workspace.showBottomPanel.set(true);
    this.workspace.zoomX.set(120);
    this.workspace.scrollX.set(0);
    this.workspace.scrollY.set(0);
    this.showToast('View System Reset', 'All panels toggled to visible. Canvas coordinates set to default scale.');
    this.activeMenu = null;
  }

  // --- Helpers ---

  formatTime(beats: number): string {
    const min = Math.floor(beats / 120);
    const sec = Math.floor((beats % 120) * 0.5);
    const ms = Math.floor(((beats % 120) * 0.5 % 1) * 1000);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  getBar(): string {
    const beats = this.project.playheadPosition();
    return Math.floor(beats / 4 + 1).toString().padStart(3, '0');
  }

  getBeat(): string {
    const beats = this.project.playheadPosition();
    return Math.floor(beats % 4 + 1).toString().padStart(2, '0');
  }

  adjustBpm(e: WheelEvent) {
    const delta = e.deltaY > 0 ? -1 : 1;
    this.project.bpm.update(b => Math.max(20, Math.min(300, b + delta)));
  }
}
