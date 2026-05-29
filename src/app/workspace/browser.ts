import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AudioEngineService } from '../core/audio-engine.service';
import { WorkspaceService } from '../core/workspace.service';
import { ProjectService, Track } from '../core/project.service';
import { AssetLibraryService, OfflineProject, OfflinePreset, OfflineAsset } from '../core/asset-library.service';

@Component({
  selector: 'app-browser',
  standalone: true,
  imports: [MatIconModule, CommonModule],
  styles: [`
    @keyframes slide {
      from { transform: translateX(0); }
      to { transform: translateX(256px); }
    }
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(-10px); }
      15% { opacity: 1; transform: translateY(0); }
      85% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-10px); }
    }
    .toast-animate {
      animation: fadeInOut 2.8s ease-in-out forwards;
    }
    @keyframes recordingPulse {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    .pulse-record {
      animation: recordingPulse 1.2s infinite ease-in-out;
    }
  `],
  template: `
    <aside class="w-[280px] flex flex-col h-full bg-[#08080c] border-l border-t-0 border-[#1a1a24] shrink-0 select-none relative overflow-hidden">
      <!-- Floating Toast Notifications -->
      @if (toastMessage()) {
        <div class="absolute top-12 left-3 right-3 bg-[#111] border-l-4 border-l-[#06b6d4] border border-[#06b6d4]/55 text-white py-2 px-3 rounded shadow-2xl z-50 toast-animate text-center flex items-center gap-2 justify-start backdrop-blur-md">
           <mat-icon class="text-[#06b6d4] text-[15px] w-[15px] h-[15px]">verified</mat-icon>
           <span class="text-[9px] uppercase font-bold tracking-widest font-mono text-gray-200">{{ toastMessage() }}</span>
        </div>
      }

      <!-- Four Header Tabs fitted beautifully with custom padding -->
      <div class="flex text-[9px] uppercase font-bold tracking-wider text-[#666] border-b border-[#1a1a24] shrink-0">
         <button class="flex-1 pt-3 pb-2 transition-all border-b-2" [class]="activeTab === 'Sounds' ? 'text-white border-[#b82bf2]' : 'border-transparent hover:text-[#d1d1d1]'" (click)="setTab('Sounds')">Sounds</button>
         <button class="flex-1 pt-3 pb-2 transition-all border-b-2" [class]="activeTab === 'Loops' ? 'text-white border-[#b82bf2]' : 'border-transparent hover:text-[#d1d1d1]'" (click)="setTab('Loops')">Loops</button>
         <button class="flex-1 pt-3 pb-2 transition-all border-b-2" [class]="activeTab === 'Plugins' ? 'text-white border-[#b82bf2]' : 'border-transparent hover:text-[#d1d1d1]'" (click)="setTab('Plugins')">Plugins</button>
         <button class="flex-1 pt-3 pb-2 transition-all border-b-2 text-[#06b6d4]" [class]="activeTab === 'Library' ? 'text-white border-[#06b6d4]' : 'border-transparent hover:text-[#06b6d4]/80'" (click)="setTab('Library')">Library</button>
      </div>

      <!-- Quick Search Bar (Hidden for Recorder and local action contexts) -->
      @if (activeCategory !== 'lib_recorder') {
        <div class="p-3 shrink-0">
           <div class="relative group">
              <mat-icon class="absolute left-3 top-2 text-[#555] w-[14px] h-[14px] text-[14px] group-focus-within:text-[#06b6d4] transition-colors">search</mat-icon>
              <input type="text" placeholder="Procurar nesta aba..." 
                     [value]="searchQuery()"
                     (input)="onSearch($event)"
                     class="w-full bg-[#121218] border border-[#1a1a24] rounded-md pl-8 pr-8 py-1.5 text-[11px] text-[#d1d1d1] focus:outline-none focus:border-[#06b6d4]/40 focus:bg-[#161622] transition-all placeholder:text-[#555] shadow-inner font-semibold" />
              @if (searchQuery()) {
                <mat-icon class="absolute right-3 top-2 text-[#777] hover:text-white w-[14px] h-[14px] text-[14px] cursor-pointer transition-colors" (click)="clearSearch()">close</mat-icon>
              } @else {
                <mat-icon class="absolute right-3 top-2 text-[#555] w-[14px] h-[14px] text-[14px] cursor-pointer hover:text-white transition-colors">filter_list</mat-icon>
              }
           </div>
        </div>
      }

      <div class="flex-1 overflow-hidden flex gap-0.5 px-0.5 pb-0.5 min-h-0">
         <!-- Left Column (Categories and dynamic sub-filters) -->
         <div class="w-1/3 flex flex-col gap-0.5 bg-[#0b0b10] rounded-tl overflow-y-auto scrollbar-none py-1">
            @for (cat of currentCategories; track cat.id) {
               <button 
                  class="flex flex-col items-center justify-center gap-1 py-2.5 text-[8.5px] font-bold tracking-wide rounded-sm mx-1 transition-all shrink-0 min-h-[48px]"
                  [class]="activeCategory === cat.id ? 'text-white bg-[#1a1a24] shadow-sm border-l-2 border-[#06b6d4]' : 'text-[#666] hover:text-[#a0a0b0] hover:bg-[#121218]'"
                  (click)="selectCategory(cat.id)">
                 <mat-icon class="text-[16px] w-[16px] h-[16px]" [class.text-[#06b6d4]]="activeCategory === cat.id">{{ cat.icon }}</mat-icon> 
                 <span class="truncate max-w-full text-center px-0.5">{{ cat.name }}</span>
               </button>
            }
         </div>

         <!-- Right Column (Items List & Action Forms) -->
         <div class="w-2/3 flex flex-col gap-0.5 bg-[#0b0b10] rounded-tr overflow-y-auto scrollbar-thin scrollbar-thumb-[#232332] p-1">
            
            <!-- EXCLUSIVES FOR OFFLINE LIBRARY TAB -->
            @if (activeTab === 'Library') {
               
               <!-- 1. OFFLINE SESSIONS / PROJECTS -->
               @if (activeCategory === 'lib_projects') {
                  <!-- Save current Project Form -->
                  <div class="bg-[#121218] border border-[#1a1a24] p-2 rounded mb-2 flex flex-col gap-1.5 shrink-0">
                     <span class="text-[8px] font-mono font-bold tracking-widest text-[#a0a0b0] uppercase">Salvar Sessão Atual</span>
                     <div class="flex gap-1.5">
                        <input type="text" #projName placeholder="Nome do som..." 
                               class="flex-1 bg-[#0b0b10] border border-[#222] rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-[#06b6d4]/40" />
                        <button (click)="saveProject(projName.value); projName.value=''" 
                                class="bg-[#06b6d4] text-[9px] font-bold text-black px-2 py-1 rounded hover:opacity-85 flex items-center gap-0.5 transition-all">
                           <mat-icon class="text-[11px] w-[11px] h-[11px]">save</mat-icon> Gravar
                        </button>
                     </div>
                  </div>

                  <!-- Saved Projects list -->
                  <div class="flex flex-col gap-1.5">
                     @for (proj of libraryProjects(); track proj.id) {
                        <div class="bg-[#121218] border border-white/5 hover:border-[#06b6d4]/40 p-2 rounded flex flex-col justify-between gap-1 transition-all">
                           <div class="flex justify-between items-center">
                              <span class="text-[10px] font-bold text-white truncate max-w-[100px]">{{ proj.name }}</span>
                              <span class="text-[7.5px] font-mono text-[#555]">{{ proj.createdAt | date:'HH:mm / dd-MMM' }}</span>
                           </div>
                           <div class="flex items-center justify-between text-[8px] text-[#888] font-mono">
                              <span>BPM: {{ proj.bpm }} | Tracks: {{ proj.tracks.length }}</span>
                              <div class="flex gap-1 shrink-0">
                                 <button (click)="loadProject(proj)" 
                                         class="px-2 py-0.5 text-black bg-[#06b6d4] hover:bg-white rounded font-bold transition-all flex items-center gap-0.5">
                                    <mat-icon class="text-[9px] w-[9px] h-[9px]">play_arrow</mat-icon> Abrir
                                 </button>
                                 <button (click)="deleteProject(proj.id)" 
                                         class="p-0.5 text-red-500 hover:text-white hover:bg-red-900/40 rounded transition-all">
                                    <mat-icon class="text-[11px] w-[11px] h-[11px]">delete</mat-icon>
                                 </button>
                              </div>
                           </div>
                        </div>
                     } @empty {
                        <div class="p-4 text-center text-[#555] text-[10px] italic">Nenhum projeto salvo offline</div>
                     }
                  </div>
               }
               <!-- 2. SYNTHESIZER VOICE AND FX PRESETS -->
               @else if (activeCategory === 'lib_presets') {
                  <div class="grid grid-cols-1 gap-2 mb-2">
                     <!-- Save current Synthesizer settings as preset -->
                     <div class="bg-[#121218] border border-[#1a1a24] p-2 rounded flex flex-col gap-1.5 shrink-0">
                        <span class="text-[8px] font-mono font-bold tracking-widest text-[#b82bf2] uppercase">Gravar Voz do Sintetizador</span>
                        <div class="flex gap-1.5">
                           <input type="text" #presName placeholder="Nome do preset Synth..." 
                                  class="flex-1 bg-[#0b0b10] border border-[#222] rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-[#b82bf2]/45" />
                           <button (click)="savePreset(presName.value); presName.value=''" 
                                   class="bg-[#b82bf2] text-[9px] font-bold text-white px-2 rounded hover:brightness-110 flex items-center gap-0.5 transition-all">
                              <mat-icon class="text-[11px] w-[11px] h-[11px]">bookmark</mat-icon> Salvar
                           </button>
                        </div>
                     </div>

                     <!-- Save current Track FX as plugin preset -->
                     <div class="bg-[#121218] border border-[#1a1a24] p-2 rounded flex flex-col gap-1.5 shrink-0">
                        <div class="flex justify-between items-center">
                           <span class="text-[8px] font-mono font-bold tracking-widest text-[#06b6d4] uppercase">Gravar Plugins (FX da Faixa)</span>
                           @if (workspace.selectedTrackId()) {
                              <span class="text-[7.5px] px-1 bg-[#06b6d4]/10 text-[#06b6d4] border border-[#06b6d4]/20 rounded font-bold font-mono">
                                 faixa: {{ getSelectedTrackName() }}
                              </span>
                           } @else {
                              <span class="text-[7.5px] px-1 bg-red-950/20 text-red-400 border border-red-500/10 rounded font-bold font-mono">Selecione uma faixa</span>
                           }
                        </div>
                        <div class="flex gap-1.5">
                           <input type="text" #fxPresName placeholder="Nome do preset FX..." 
                                  [disabled]="!workspace.selectedTrackId()"
                                  class="flex-1 bg-[#0b0b10] border border-[#222] rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-[#06b6d4]/45 disabled:opacity-40" />
                           <button (click)="saveFxPreset(fxPresName.value); fxPresName.value=''" 
                                   [disabled]="!workspace.selectedTrackId()"
                                   class="bg-[#06b6d4] text-[9px] font-bold text-black px-2 rounded hover:brightness-110 flex items-center gap-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                              <mat-icon class="text-[11px] w-[11px] h-[11px]">save</mat-icon> Salvar
                           </button>
                        </div>
                     </div>
                  </div>

                  <!-- Saved Presets/Plugins list -->
                  <div class="flex flex-col gap-1">
                     @for (preset of libraryPresets(); track preset.id) {
                        <div class="bg-[#121218] border border-white/5 p-1.5 rounded flex items-center justify-between text-[10px] hover:border-[#06b6d4]/20 transition-all">
                           <div class="flex flex-col truncate">
                              <span class="text-white font-bold truncate">{{ preset.name }}</span>
                              @if (preset.type === 'synth') {
                                 <span class="text-[7px] text-[#b82bf2] font-mono tracking-wider uppercase font-semibold">SYNTH • Wave: {{ preset.synthParams?.waveType }} • Cut: {{ preset.synthParams?.cutoff }}Hz</span>
                              } @else {
                                 <span class="text-[7px] text-[#06b6d4] font-mono tracking-wider uppercase font-semibold">FX PLUGINS • COMP & REVERB • CHANNEL GRID</span>
                              }
                           </div>
                           <div class="flex gap-1 font-mono shrink-0">
                              <button (click)="loadPreset(preset)" 
                                      class="px-1.5 py-0.5 bg-[#06b6d4] text-black font-extrabold rounded text-[8px] hover:bg-white transition-all">
                                 LOAD
                              </button>
                              <button (click)="deletePreset(preset.id)" 
                                      class="p-0.5 text-[#555] hover:text-red-500 rounded transition-all">
                                 <mat-icon class="text-[11px] w-[11px] h-[11px]">delete</mat-icon>
                              </button>
                           </div>
                        </div>
                     } @empty {
                        <div class="p-4 text-center text-[#555] text-[10px] italic">Sem presets salvos na biblioteca</div>
                     }
                  </div>
               }

               <!-- 3. SOUND CLIPS & DRAGGABLES -->
               @else if (activeCategory === 'lib_assets') {
                  <!-- Styled file uploader - refactored into button tag for accessibility -->
                  <button type="button" class="w-full bg-[#121218] border border-dashed border-[#06b6d4]/40 p-2.5 rounded mb-3 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-[#161624] hover:border-[#06b6d4]/70 transition-all outline-none"
                       (click)="fileInput.click()">
                     <mat-icon class="text-[#06b6d4] text-[20px] w-[20px] h-[20px] mb-1">upload_file</mat-icon>
                     <span class="text-[9.5px] font-bold text-white uppercase tracking-wider">Importar Arquivo .WAV</span>
                     <span class="text-[7.5px] text-[#666] font-mono mt-0.5">Clique ou arraste de seu disco</span>
                     <input type="file" #fileInput class="hidden" (change)="onFileUploaded($event)" accept="audio/*" />
                  </button>

                  <!-- Sound assets lists with focusable accessibility wrappers -->
                  <div class="flex flex-col gap-1.5">
                     @for (sound of libraryAssets(); track sound.id) {
                        <div draggable="true"
                             (dragstart)="onDragStart($event, sound.name)"
                             class="bg-[#121218] border border-transparent hover:border-[#06b6d4]/30 px-2 py-1.5 rounded flex items-center justify-between cursor-grab active:cursor-grabbing transition-all">
                           <button type="button" class="flex items-center gap-1.5 truncate flex-1 min-w-0 text-left outline-none bg-transparent border-none text-gray-200" (click)="playLocalAsset(sound)">
                              <mat-icon class="text-[#06b6d4] text-[15px] w-[15px] h-[15px] shrink-0">music_note</mat-icon>
                              <div class="flex flex-col truncate min-w-0 leading-tight">
                                 <span class="text-[10px] font-bold text-white truncate" [class.text-[#06b6d4]]="activeSample === sound.name">{{ sound.name }}</span>
                                 <span class="text-[7.5px] text-[#666] font-mono uppercase">{{ sound.category }} | drag on track</span>
                              </div>
                           </button>
                           <div class="flex items-center gap-1 shrink-0 ml-1">
                              <button type="button" class="w-5 h-5 rounded-full bg-[#1e1e2c] border border-white/5 flex items-center justify-center cursor-pointer text-white hover:bg-[#06b6d4] hover:text-black transition-all outline-none" 
                                   (click)="playLocalAsset(sound)">
                                 <mat-icon class="text-[11px] w-[11px] h-[11px] font-bold">play_arrow</mat-icon>
                              </button>
                              <button (click)="deleteAsset(sound.id)" 
                                      class="p-0.5 text-white/30 hover:text-red-500 rounded transition-all">
                                 <mat-icon class="text-[11px] w-[11px] h-[11px]">delete</mat-icon>
                              </button>
                           </div>
                        </div>
                     } @empty {
                        <div class="p-4 text-center text-[#555] text-[10px] italic">Arraste um som ou grave para carregar</div>
                     }
                  </div>
               }

               <!-- 4. MIC CAPTURE & LIVE AUDIO ACQUISITION -->
               @else if (activeCategory === 'lib_recorder') {
                  <div class="bg-[#121218] border border-[#1a1a24] rounded-md p-3 flex flex-col items-center justify-center gap-4 text-center select-none shadow-inner">
                     <!-- Animated recording pulse -->
                     <div class="w-16 h-16 rounded-full border flex items-center justify-center relative transition-all"
                          [class]="assetLibrary.isRecording() ? 'border-red-500 bg-red-950/20 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'border-[#1a1a24] bg-black/40'">
                        @if (assetLibrary.isRecording()) {
                           <div class="absolute inset-0 w-full h-full rounded-full border border-red-500/40 pulse-record"></div>
                           <mat-icon class="text-red-500 text-[28px] w-[28px] h-[28px]">mic</mat-icon>
                        } @else {
                           <mat-icon class="text-[#555] text-[28px] w-[28px] h-[28px]">mic_none</mat-icon>
                        }
                     </div>

                     <div class="flex flex-col">
                        @if (assetLibrary.isRecording()) {
                           <span class="text-red-500 text-[11px] font-extrabold tracking-widest uppercase">GRAVANDO VOZ LIVE</span>
                           <span class="text-[16px] font-mono text-white font-bold mt-1 tracking-wider">{{ formatDuration(assetLibrary.recordingDuration()) }}</span>
                        } @else {
                           <span class="text-white text-[10px] font-bold uppercase tracking-wider">Capturar Amostra do Mic</span>
                           <span class="text-[8px] text-[#666] font-medium leading-relaxed max-w-[140px] mt-1 mx-auto">Grave vozes, instrumentos ou ruídos acústicos offline.</span>
                        }
                     </div>

                     <!-- Recording level indicator graph -->
                     @if (assetLibrary.isRecording()) {
                        <div class="w-full flex justify-center items-end gap-1.5 h-6 px-4">
                           <div class="w-1 h-3 rounded-full bg-red-500 shrink-0 pulse-record"></div>
                           <div class="w-1 h-5 rounded-full bg-red-400 shrink-0 animate-pulse"></div>
                           <div class="w-1 h-4 rounded-full bg-red-500 shrink-0 pulse-record"></div>
                           <div class="w-1 h-6 rounded-full bg-red-400 shrink-0 animate-pulse"></div>
                           <div class="w-1 h-3 rounded-full bg-red-500 shrink-0 pulse-record"></div>
                           <div class="w-1 h-5 rounded-full bg-red-400 shrink-0 animate-pulse"></div>
                           <div class="w-1 h-2 rounded-full bg-red-500 shrink-0 pulse-record"></div>
                        </div>
                     }

                     <!-- Start/Stop Capture Trigger button -->
                     <button (click)="toggleRecorderMode()" 
                             class="w-full max-w-[150px] py-1.5 px-4 font-extrabold text-[10px] uppercase rounded-md flex items-center justify-center gap-1 shadow-md transition-all outline-none"
                             [class]="assetLibrary.isRecording() ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30' : 'bg-[#06b6d4] hover:bg-white text-black'">
                        <mat-icon class="text-[14px] w-[14px] h-[14px] font-bold">{{ assetLibrary.isRecording() ? 'stop' : 'radio_button_checked' }}</mat-icon>
                        {{ assetLibrary.isRecording() ? 'PARAR GRAVAÇÃO' : 'GRAVAR AGORA' }}
                     </button>
                  </div>

                  <!-- Quick redirect guide label -->
                  <div class="p-2 border border-white/5 bg-[#121218] rounded mt-2 flex items-center gap-1.5 text-[8.5px] font-mono text-[#88889a] leading-tight font-semibold">
                     <mat-icon class="text-[#06b6d4] text-[13px] w-[13px] h-[13px]">info</mat-icon>
                     <span>Os arquivos gerados são listados na aba "Clips" após concluir a gravação.</span>
                  </div>
               }
            } @else {
               
               <!-- ORIGINAL PRELOAD SOUNDS / LOOPS / PLUGINS tabs rendering loop -->
               @for (item of filteredItems; track item.name) {
                 <button 
                     draggable="true"
                     (dragstart)="onDragStart($event, item.name)"
                     (click)="playSample(item.name)"
                     class="px-2.5 py-2 text-[10.5px] rounded-sm text-left truncate transition-all cursor-grab active:cursor-grabbing border break-all leading-tight shrink-0"
                     [class]="activeSample === item.name ? 'text-white bg-[#b82bf2]/10 border-[#b82bf2]/30 shadow-sm' : 'text-[#888] bg-[#121218] border-transparent hover:text-white hover:bg-[#1a1a24]'"
                 >{{ item.name }}</button>
               } @empty {
                 <div class="p-4 text-center text-[#555] text-[10px] italic">Nenhum som localizado.</div>
               }
            }
         </div>
      </div>

      <!-- Custom Interactive Preview & Installation Panel -->
      @if (activeTab === 'Plugins') {
        <div class="h-36 bg-[#121218] border-t border-[#1a1a24] p-3 flex flex-col justify-between shrink-0 drop-shadow-md relative select-none">
           <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#232332] pr-1 z-10 select-text">
               <div class="flex items-center gap-1 text-[8px] font-bold text-[#b82bf2] tracking-wider uppercase mb-1">
                 <mat-icon class="text-[11px] w-[11px] h-[11px] text-[#b82bf2]">verified</mat-icon> 
                 {{ getPluginPreset(activeSample)?.type === 'instrument' ? 'Virtual Instrument Synth' : 'Classic DSP Analog Effect' }}
               </div>
               <div class="text-[11px] text-white font-bold mb-1 truncate tracking-wide flex items-center justify-between">
                 <span>{{ activeSample || 'No active preset' }}</span>
                 <span class="text-[7.5px] text-[#6366f1] font-mono select-none px-1 bg-[#1a1a24] rounded border border-[#23232f] uppercase tracking-widest font-semibold shrink-0">Emulated</span>
               </div>
               <div class="text-[9.5px] text-[#88889a] leading-[1.3] font-medium h-[46px] overflow-y-auto select-none">{{ getPluginPreset(activeSample)?.description || 'Please select a virtual hardware effect or synth preset.' }}</div>
           </div>
           
           <div class="flex gap-2 items-center justify-between mt-2 shrink-0 z-10">
               <button 
                  (click)="loadPluginPreset()"
                  class="flex-1 py-2 px-3 bg-gradient-to-r from-[#b82bf2] to-[#6366f1] text-[10.5px] font-bold text-white rounded-md flex items-center justify-center gap-1.5 hover:brightness-115 active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_12px_rgba(184,43,242,0.35)] select-none">
                  <mat-icon class="text-[13px] w-[13px] h-[13px]">bolt</mat-icon> LOAD PRESET IN DAW
               </button>
           </div>
        </div>
      } @else {
        <!-- Sound Sample Preview Panel -->
        <div class="h-28 bg-[#121218] border-t border-[#1a1a24] p-3 flex flex-col justify-between shrink-0 drop-shadow-md">
           <div class="h-10 w-full bg-[#0b0b10] rounded-md border border-[#1a1a24] flex items-center justify-center overflow-hidden relative shadow-inner">
              <svg viewBox="0 0 100 20" preserveAspectRatio="none" class="w-full h-full opacity-60" [class.animate-pulse]="previewing">
                <path d="M0 10 Q5 2 10 10 T20 10 T30 10 T40 10 T50 10 T60 10 T70 10 T80 10 T90 10 T100 10" fill="none" stroke="#06b6d4" stroke-width="0.8"></path>
                <path d="M0 10 Q5 18 10 10 T20 10 T30 10 T40 10 T50 10 T60 10 T70 10 T80 10 T90 10 T100 10" fill="none" stroke="#b82bf2" stroke-width="0.8"></path>
              </svg>
              <div class="absolute left-0 top-0 bottom-0 w-px bg-white/50" [class]="previewing ? 'animate-[slide_0.3s_linear]' : 'hidden'"></div>
           </div>
           <div class="flex justify-between items-end">
              <div class="flex-1 w-full pr-2 overflow-hidden">
                 <div class="text-[10px] text-white font-bold mb-1 truncate w-full tracking-wide">{{ activeSample || 'No sample' }}</div>
                 <div class="flex gap-3 text-[8px] text-[#666] font-mono tracking-widest uppercase">
                   <span>44.1 kHz</span>
                   <span>24-bit</span>
                 </div>
              </div>
              <div class="flex items-center gap-2 border-none">
                 <mat-icon class="text-[#555] text-[16px] w-[16px] h-[16px] cursor-pointer hover:text-red-500 transition-colors">favorite</mat-icon>
                 <button type="button" class="w-6 h-6 rounded-full border border-[#2a2a35] bg-[#1a1a24] flex items-center justify-center cursor-pointer hover:bg-[#232332] text-white outline-none" (click)="clickPlayTrigger()">
                   <mat-icon class="text-[12px] w-[12px] h-[12px]">play_arrow</mat-icon>
                 </button>
              </div>
           </div>
        </div>
      }
    </aside>
  `
})
export class BrowserComponent implements OnInit {
  audio = inject(AudioEngineService);
  workspace = inject(WorkspaceService);
  project = inject(ProjectService);
  assetLibrary = inject(AssetLibraryService);
  
  activeTab = 'Sounds';
  searchQuery = signal('');
  toastMessage = signal<string | null>(null);
  
  categories = [
    { id: 'drums', name: 'Drums', icon: 'album' },
    { id: 'drums_tops', name: 'HiHats', icon: 'lens_blur' },
    { id: 'bass', name: 'Bass', icon: 'speaker' },
    { id: 'keys', name: 'Keys', icon: 'piano' },
    { id: 'leads', name: 'Leads', icon: 'straighten' },
    { id: 'pads', name: 'Pads', icon: 'blur_on' },
    { id: 'vocals', name: 'Vocals', icon: 'mic' },
    { id: 'fx', name: 'SFX', icon: 'graphic_eq' },
  ];

  pluginCats = [
    { id: 'inst', name: 'Instruments', icon: 'piano' },
    { id: 'eq', name: 'EQ & Filters', icon: 'tune' },
    { id: 'dyn', name: 'Dynamics', icon: 'compress' },
    { id: 'rev', name: 'Reverb/Delay', icon: 'waves' },
    { id: 'mod', name: 'Modulation', icon: 'blur_circular' },
  ];

  itemsDb: Record<string, {name: string, url?: string}[]> = {
    'drums': [
      { name: 'Wes Kick', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/kick.wav' },
      { name: 'Wes Snare', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/snare.wav' },
      { name: 'Wes Clap', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/clap.wav' },
      { name: 'Wes Tom', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tom.wav' },
      { name: 'Wes Boom', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/boom.wav' },
      { name: 'Tone Kick', url: 'https://tonejs.github.io/audio/drum-samples/kick.mp3' },
      { name: 'Tone Snare', url: 'https://tonejs.github.io/audio/drum-samples/snare.mp3' },
      { name: 'Tone Tom 1', url: 'https://tonejs.github.io/audio/drum-samples/tom1.mp3' },
      { name: 'Tone Tom 2', url: 'https://tonejs.github.io/audio/drum-samples/tom2.mp3' },
      { name: 'Tone Tom 3', url: 'https://tonejs.github.io/audio/drum-samples/tom3.mp3' }
    ],
    'drums_tops': [
      { name: 'Wes HiHat', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/hihat.wav' },
      { name: 'Wes OpenHat', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/openhat.wav' },
      { name: 'Wes Ride', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/ride.wav' },
      { name: 'Wes Tink', url: 'https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tink.wav' },
      { name: 'Tone HiHat', url: 'https://tonejs.github.io/audio/drum-samples/hihat.mp3' },
      { name: 'Tone Cowbell', url: 'https://tonejs.github.io/audio/drum-samples/cowbell.mp3' },
      { name: 'Tone Clap', url: 'https://tonejs.github.io/audio/drum-samples/clap.mp3' },
      { name: 'Tone Crash', url: 'https://tonejs.github.io/audio/drum-samples/crash.mp3' }
    ],
    'bass': [
       { name: 'Sub 808', url: 'https://tonejs.github.io/audio/casio/A1.mp3' },
       { name: 'Deep FM Bass', url: 'https://tonejs.github.io/audio/casio/C2.mp3' },
       { name: 'Moog Pluck', url: 'https://tonejs.github.io/audio/casio/E2.mp3' },
       { name: 'Acid 303', url: 'https://tonejs.github.io/audio/casio/G2.mp3' },
       { name: 'Slap Bass', url: 'https://tonejs.github.io/audio/casio/A2.mp3' },
       { name: 'Reese Bass', url: 'https://tonejs.github.io/audio/casio/C3.mp3' }
    ],
    'keys': [
       { name: 'Grand Piano', url: 'https://tonejs.github.io/audio/salamander/C4.mp3' },
       { name: 'Upright Piano', url: 'https://tonejs.github.io/audio/salamander/E3.mp3' },
       { name: 'Rhodes Mark I', url: 'https://tonejs.github.io/audio/casio/C3.mp3' },
       { name: 'Wurlitzer', url: 'https://tonejs.github.io/audio/casio/G3.mp3' },
       { name: 'DX7 E-Piano', url: 'https://tonejs.github.io/audio/casio/E4.mp3' }
    ],
    'leads': [
       { name: 'Saw Lead', url: 'https://tonejs.github.io/audio/casio/C4.mp3' },
       { name: 'Square Pluck', url: 'https://tonejs.github.io/audio/casio/E4.mp3' },
       { name: 'Trance Lead', url: 'https://tonejs.github.io/audio/casio/G4.mp3' },
       { name: 'Sine Glide', url: 'https://tonejs.github.io/audio/casio/C5.mp3' },
       { name: 'Distorted Synth', url: 'https://tonejs.github.io/audio/casio/G5.mp3' }
    ],
    'pads': [
       { name: 'Atmos Pad', url: 'https://tonejs.github.io/audio/loop/chords.mp3' },
       { name: 'Warm Strings', url: 'https://tonejs.github.io/audio/salamander/A4.mp3' },
       { name: 'Cinematic Drone', url: 'https://tonejs.github.io/audio/loop/acoustic.mp3' },
       { name: 'Glass Pad', url: 'https://tonejs.github.io/audio/salamander/C5.mp3' },
       { name: 'Choir Ahhh', url: 'https://tonejs.github.io/audio/salamander/A5.mp3' }
    ],
    'vocals': [
       { name: 'Vox 1', url: 'https://tonejs.github.io/audio/salamander/A4.mp3' },
       { name: 'Vox 2', url: 'https://tonejs.github.io/audio/salamander/C5.mp3' }, 
       { name: 'Vocal Chop 01', url: 'https://tonejs.github.io/audio/salamander/F#4.mp3' },
       { name: 'Vox Ooh', url: 'https://tonejs.github.io/audio/salamander/C4.mp3' },
       { name: 'Vox Ahh', url: 'https://tonejs.github.io/audio/salamander/A3.mp3' },
       { name: 'Ad Lib Yeah', url: 'https://tonejs.github.io/audio/salamander/D#4.mp3' },
       { name: 'Robot Voice', url: 'https://tonejs.github.io/audio/salamander/F#3.mp3' }
    ],
    'fx': [
       { name: 'Impact Deep', url: 'https://tonejs.github.io/audio/drum-samples/kick.mp3' },
       { name: 'Sweep Up 8 Bars', url: 'https://tonejs.github.io/audio/loop/rhythm.mp3' },
       { name: 'Riser FX', url: 'https://tonejs.github.io/audio/drum-samples/clap.mp3' },
       { name: 'Downlifter', url: 'https://tonejs.github.io/audio/drum-samples/tom3.mp3' },
       { name: 'Laser Pew', url: 'https://tonejs.github.io/audio/drum-samples/cowbell.mp3' },
       { name: 'White Noise', url: 'https://tonejs.github.io/audio/drum-samples/crash.mp3' }
    ],
    'loops': [
       { name: 'House Rhythm Loop', url: 'https://tonejs.github.io/audio/loop/rhythm.mp3' },
       { name: 'Ambient Chords Loop', url: 'https://tonejs.github.io/audio/loop/chords.mp3' },
       { name: 'Acoustic Folk Loop', url: 'https://tonejs.github.io/audio/loop/acoustic.mp3' }
    ],
    
    // Core emulated plug-ins 
    'inst': [
      { name: 'Wavetable Pro' }, 
      { name: 'Moog Analog D' }, 
      { name: 'DX7 Retro FM' }, 
      { name: 'Jupiter-8 Super' }, 
      { name: 'TR-808 Drum Machine' }, 
      { name: 'TR-909 Acid Rack' }, 
      { name: 'Mellotron Flutes' }, 
      { name: 'Solina String Machine' }, 
      { name: 'OB-Xa Brass Synth' }, 
      { name: 'Acid 303 Bassline' }
    ],
    'eq': [
      { name: 'Pultec EQP-1A' }, 
      { name: 'SSL 4000E G-Channel' }, 
      { name: 'Neve 1073 Preamp & EQ' }, 
      { name: 'FabFilter Pro-Q Emul' }, 
      { name: 'Auto Filter LFO' }, 
      { name: 'Phase Shift Linear EQ' }, 
      { name: 'Vintage Wah-Wah Pedal' }
    ],
    'dyn': [
      { name: 'Teletronix LA-2A' }, 
      { name: 'Urei 1176LN FET' }, 
      { name: 'SSL G-Master Bus Glue' }, 
      { name: 'dBX 160A Punch VCA' }, 
      { name: 'Fairchild 670 Deluxe' }, 
      { name: 'Pro-L 2 True Peak' }, 
      { name: 'Transient Shaper V2' }
    ],
    'rev': [
      { name: 'Lexicon 480L Hall' }, 
      { name: 'EMT 140 Stereo Plate' }, 
      { name: 'Space Echo RE-201 Tape' }, 
      { name: "Valhalla Ambient Shimmer" }, 
      { name: 'Binson Echorec Magnetic' }, 
      { name: 'Fender Spring Tank' }, 
      { name: 'Reverse Gate Reverb' }
    ],
    'mod': [
      { name: 'CE-2 Bucket Brigade' }, 
      { name: 'Dimension D Stereo Exp' }, 
      { name: 'Phase 90 Script Pedal' }, 
      { name: 'Uni-Vibe Rotary' }, 
      { name: 'Leslie Cab 122' }, 
      { name: 'Small Stone Phase' }, 
      { name: 'Vintage Ring Modulator' }
    ]
  };

  // Preset emulation description details
  presetsDb: Record<string, {
    name: string;
    type: 'instrument' | 'effect';
    description: string;
    params?: Partial<Track>;
    synthParams?: {
      cutoff?: number;
      resonance?: number;
      attack?: number;
      release?: number;
      waveType?: OscillatorType;
      octave?: number;
    }
  }> = {
    "Wavetable Pro": {
      name: "Wavetable Pro",
      type: "instrument",
      description: "Advanced digital hybrid synth with wavetable morphing, bright digital spectra, and progressive cutoff sweeps.",
      synthParams: { waveType: "sawtooth", cutoff: 3500, resonance: 4.5, attack: 0.04, release: 0.45, octave: 0 }
    },
    "Moog Analog D": {
      name: "Moog Analog D",
      type: "instrument",
      description: "Legendary Ladder Lowpass Filter Emulator. Delivers warm, highly saturated sub-bass tones and sweeping retro-synth weights.",
      synthParams: { waveType: "sawtooth", cutoff: 650, resonance: 6.0, attack: 0.02, release: 0.25, octave: -1 }
    },
    "DX7 Retro FM": {
      name: "DX7 Retro FM",
      type: "instrument",
      description: "Tine bell oscillator modeled on famous DX7 synthesizer. Bright digital sustain with signature dynamic FM envelope keys.",
      synthParams: { waveType: "sine", cutoff: 4500, resonance: 1.5, attack: 0.005, release: 1.2, octave: 0 }
    },
    "Jupiter-8 Super": {
      name: "Jupiter-8 Super",
      type: "instrument",
      description: "Rich, lush 8-voice polyphonic analog supersaw. The quintessential 1980s epic pad machine, perfect for ambient backdrops.",
      synthParams: { waveType: "sawtooth", cutoff: 1800, resonance: 3.5, attack: 0.15, release: 0.8, octave: 0 }
    },
    "TR-808 Drum Machine": {
      name: "TR-808 Drum Machine",
      type: "instrument",
      description: "Deep sine sub-kick and snappy white-noise snare generator. Essential vintage drum weight designed for Hip Hop, Trap, and R&B.",
      synthParams: { waveType: "sine", cutoff: 300, resonance: 1.2, attack: 0.002, release: 1.5, octave: -2 }
    },
    "TR-909 Acid Rack": {
      name: "TR-909 Acid Rack",
      type: "instrument",
      description: "Hard-hitting analog house/techno synthesizer. Generates ultra-punchy square attacks with compact envelope decay.",
      synthParams: { waveType: "square", cutoff: 2100, resonance: 5.5, attack: 0.001, release: 0.1, octave: 0 }
    },
    "Mellotron Flutes": {
      name: "Mellotron Flutes",
      type: "instrument",
      description: "Woodwinds tape-loop synthesizer. Features slow attack curves, tape fluttering, and 8-second aging tape absorption vibes.",
      synthParams: { waveType: "triangle", cutoff: 2800, resonance: 1.0, attack: 0.08, release: 0.35, octave: 1 }
    },
    "Solina String Machine": {
      name: "Solina String Machine",
      type: "instrument",
      description: "Warm, sweeping orchestral strings. Uses retro bucket-brigade multi-chorus layering to deliver a nostalgic symphonic curtain.",
      synthParams: { waveType: "sawtooth", cutoff: 1550, resonance: 2.0, attack: 0.25, release: 1.5, octave: 1 }
    },
    "OB-Xa Brass Synth": {
      name: "OB-Xa Brass Synth",
      type: "instrument",
      description: "Famous fat analog brass sweeps. Sharp filter attack envelope that lets lead lines scream and chords growl majestically.",
      synthParams: { waveType: "sawtooth", cutoff: 2300, resonance: 2.5, attack: 0.1, release: 0.5, octave: 0 }
    },
    "Acid 303 Bassline": {
      name: "Acid 303 Bassline",
      type: "instrument",
      description: "Aggressive squelchy bass-box emulator. Employs ultra-high lowpass filter resonance for driving continuous acid sweeps.",
      synthParams: { waveType: "sawtooth", cutoff: 950, resonance: 9.0, attack: 0.01, release: 0.15, octave: -1 }
    },
    "Pultec EQP-1A": {
      name: "Pultec EQP-1A",
      type: "effect",
      description: "Passive tube program EQ modeling. Adds magical low shelf boost together with a surgical high shelf air sweep.",
      params: { eqLow: 6.0, eqMid: -1.5, eqHigh: 4.5, filterType: "lowpass", filterCutoff: 18000, filterReso: 1.0 }
    },
    "SSL 4000E G-Channel": {
      name: "SSL 4000E G-Channel",
      type: "effect",
      description: "Aggressive British console EQ. Features punchy mid cuts and high frequency crispyiness designed to sit tracks perfectly.",
      params: { eqLow: 2.0, eqMid: -3.0, eqHigh: 3.5, filterType: "highpass", filterCutoff: 75, filterReso: 0.8 }
    },
    "Neve 1073 Preamp & EQ": {
      name: "Neve 1073 Preamp & EQ",
      type: "effect",
      description: "Thick, warm British pre-amp EQ emulation. Adds organic odd-harmonic saturation and colorful low-end warmth.",
      params: { eqLow: 4.5, eqMid: 2.0, eqHigh: 1.5, distortionDrive: 35, distortionMix: 0.40 }
    },
    "FabFilter Pro-Q Emul": {
      name: "FabFilter Pro-Q Emul",
      type: "effect",
      description: "Crystal-clear parametric mastering shelving. Extremely transparent boost designed for top-end shine and sub balance.",
      params: { eqLow: -1.5, eqMid: 1.5, eqHigh: 2.5, filterType: "lowpass", filterCutoff: 20000, filterReso: 0.7 }
    },
    "Auto Filter LFO": {
      name: "Auto Filter LFO",
      type: "effect",
      description: "Sweeps a resonant bandpass center frequency continuously using a virtual low-frequency sinewave moderator.",
      params: { filterType: "bandpass", filterCutoff: 1350, filterReso: 5.5, chorusRate: 1.5, chorusDepth: 0.70, chorusMix: 0.55 }
    },
    "Phase Shift Linear EQ": {
      name: "Phase Shift Linear EQ",
      type: "effect",
      description: "A zero-phase-linear mastering EQ rack. Prevents phase smearing across adjacent bands so vocals and keys stay aligned.",
      params: { eqLow: -0.5, eqMid: 0.5, eqHigh: 1.5 }
    },
    "Vintage Wah-Wah Pedal": {
      name: "Vintage Wah-Wah Pedal",
      type: "effect",
      description: "Famous rock guitar pedal. Modulates a sharp bandpass filter sweep centered on critical vocal intelligibility registers.",
      params: { filterType: "bandpass", filterCutoff: 820, filterReso: 7.5, chorusRate: 3.2, chorusDepth: 0.75, chorusMix: 0.45 }
    },
    "Teletronix LA-2A": {
      name: "Teletronix LA-2A",
      type: "effect",
      description: "Legendary optical tube compressor. Delivers smooth, musical, transparent gain reduction with rich tube warmth.",
      params: { compThreshold: -26, compRatio: 3.0, distortionDrive: 18, distortionMix: 0.25 }
    },
    "Urei 1176LN FET": {
      name: "Urei 1176LN FET",
      type: "effect",
      description: "Ultrafast FET compressor. Extremely punchy, adds high attitude, gritty saturating bite, and mid Presence to leads & vocals.",
      params: { compThreshold: -15, compRatio: 8.0, eqMid: 2.0, distortionDrive: 42, distortionMix: 0.35 }
    },
    "SSL G-Master Bus Glue": {
      name: "SSL G-Master Bus Glue",
      type: "effect",
      description: "Ultimate mix-bus VCA glue compressor. Binds the entire master track together, making it sound unified, polished, and solid.",
      params: { compThreshold: -12, compRatio: 2.5, eqLow: 1.0, eqHigh: 1.0 }
    },
    "dBX 160A Punch VCA": {
      name: "dBX 160A Punch VCA",
      type: "effect",
      description: "Hard-knee VCA feedback compressor. Delivers instantaneous, aggressive transient snap specifically for live/acoustic drums.",
      params: { compThreshold: -14, compRatio: 4.5, eqLow: 2.0 }
    },
    "Fairchild 670 Deluxe": {
      name: "Fairchild 670 Deluxe",
      type: "effect",
      description: "Stately 1950s tube mastering limiter. Infuses dense tape cohesion, sweeping dynamic lift, and rich retro tube sheen.",
      params: { compThreshold: -20, compRatio: 3.5, distortionDrive: 28, distortionMix: 0.45, eqLow: 1.5 }
    },
    "Pro-L 2 True Peak": {
      name: "Pro-L 2 True Peak",
      type: "effect",
      description: "Ultra-precise brickwall mastering limiter. Provides maximum master loudness without clipping or digital distortion.",
      params: { compThreshold: -6, compRatio: 20.0, eqLow: 0.5, eqHigh: 0.5 }
    },
    "Transient Shaper V2": {
      name: "Transient Shaper V2",
      type: "effect",
      description: "Dedicated envelope shaping filter. Amplifies initial drum hits and shortens sustain tails. Adds punch and snap.",
      params: { compThreshold: -8, compRatio: 1.5, eqHigh: 2.5 }
    },
    "Lexicon 480L Hall": {
      name: "Lexicon 480L Hall",
      type: "effect",
      description: "Iconic digital studio reverberator. Recreates deep, magnificent plates and halls with sweeping spatial diffusion.",
      params: { reverbDecay: 5.5, reverbMix: 0.35, eqLow: -1.0, eqHigh: -1.5 }
    },
    "EMT 140 Stereo Plate": {
      name: "EMT 140 Stereo Plate",
      type: "effect",
      description: "Lustrous, classic 1960s steel plate. Features bright initial reflections and a highly dense decay tail.",
      params: { reverbDecay: 2.2, reverbMix: 0.22, eqHigh: 2.0, filterType: "highpass", filterCutoff: 180 }
    },
    "Space Echo RE-201 Tape": {
      name: "Space Echo RE-201 Tape",
      type: "effect",
      description: "Vintage multi-head multi-mode tape delay. Provides warm, fluttering analog echo delays with tape-drive saturation.",
      params: { delayTime: 0.38, delayFeedback: 0.60, delayMix: 0.35, distortionDrive: 32, distortionMix: 0.30 }
    },
    "Valhalla Ambient Shimmer": {
      name: "Valhalla Ambient Shimmer",
      type: "effect",
      description: "Massive ambient waveguide reverb combined with linear LFO modulation. Creates a colossal shimmering tail.",
      params: { reverbDecay: 7.5, reverbMix: 0.50, chorusRate: 2.2, chorusDepth: 0.55, chorusMix: 0.35 }
    },
    "Binson Echorec Magnetic": {
      name: "Binson Echorec Magnetic",
      type: "effect",
      description: "Rare magnetic drum echo pedal simulation. Warm, dark, fluttering rhythmic delays that cascade beautifully.",
      params: { delayTime: 0.18, delayFeedback: 0.52, delayMix: 0.25, eqHigh: -1.0 }
    },
    "Fender Spring Tank": {
      name: "Fender Spring Tank",
      type: "effect",
      description: "Metallic spring reverb modeling from retro Surf guitars. Clattery, splashy, and highly textured.",
      params: { reverbDecay: 1.8, reverbMix: 0.30, eqHigh: 3.0, filterType: "bandpass", filterCutoff: 1100 }
    },
    "Reverse Gate Reverb": {
      name: "Reverse Gate Reverb",
      type: "effect",
      description: "Gated room reverb made famous in the 1980s. Drastically cuts off reverb tails to pack max punch.",
      params: { reverbDecay: 0.8, reverbMix: 0.40, compThreshold: -12, compRatio: 6.0, eqLow: 1.5 }
    },
    "CE-2 Bucket Brigade": {
      name: "CE-2 Bucket Brigade",
      type: "effect",
      description: "Classic Japanese BBD chorus pedal. Adds lush, sweeping stereo motion and high-end liquidity to pads and leads.",
      params: { chorusRate: 1.2, chorusDepth: 0.50, chorusMix: 0.45, filterType: "lowpass", filterCutoff: 13000 }
    },
    "Dimension D Stereo Exp": {
      name: "Dimension D Stereo Exp",
      type: "effect",
      description: "Famous spatial expander. Delivers subtle, beautiful stereo widening and massive acoustic air without pitch vibrato.",
      params: { chorusRate: 0.2, chorusDepth: 0.80, chorusMix: 0.65 }
    },
    "Phase 90 Script Pedal": {
      name: "Phase 90 Script Pedal",
      type: "effect",
      description: "Vintage 4-stage sweep phaser pedal. Adds mesmerizing liquid swirls and psychedelic motion to chords and keyboards.",
      params: { chorusRate: 0.5, chorusDepth: 0.70, chorusMix: 0.40, filterType: "bandpass", filterCutoff: 850 }
    },
    "Uni-Vibe Rotary": {
      name: "Uni-Vibe Rotary",
      type: "effect",
      description: "1969 photoelectric phase-shifting chorus. Pulsating, vibrating organ-cab swell with deep harmonic modulation.",
      params: { chorusRate: 2.8, chorusDepth: 0.65, chorusMix: 0.55 }
    },
    "Leslie Cab 122": {
      name: "Leslie Cab 122",
      type: "effect",
      description: "Spinning wood organ cabinet. Swirls treble frequencies with rotating Doppler sweep, warm mids, and deep spatial phasing.",
      params: { chorusRate: 4.2, chorusDepth: 0.80, chorusMix: 0.50, eqMid: 2.0, filterType: "lowpass", filterCutoff: 8000 }
    },
    "Small Stone Phase": {
      name: "Small Stone Phase",
      type: "effect",
      description: "Feedback-driven sweeping phase shifter. Slow, sweeping planetary filter curves that are perfect for synth ambient pads.",
      params: { chorusRate: 0.35, chorusDepth: 0.95, chorusMix: 0.50, filterType: "bandpass", filterCutoff: 1250, filterReso: 4.0 }
    },
    "Vintage Ring Modulator": {
      name: "Vintage Ring Modulator",
      type: "effect",
      description: "Harsh, grid-like multiplier synth. Generates complex cybernetic chime sidebands and robotized metallic frequency keys.",
      params: { filterType: "highpass", filterCutoff: 2100, filterReso: 6.5, distortionDrive: 18, distortionMix: 0.40 }
    }
  };

  activeCategory = 'drums';
  currentItems: {name: string, url?: string}[] = this.itemsDb['drums'];

  activeSample: string | null = 'Wes Kick';
  previewing = false;
  private previewTimeout: ReturnType<typeof setTimeout> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Read signals from our database Library index
  libraryProjects = computed(() => this.assetLibrary.savedProjects());
  libraryPresets = computed(() => this.assetLibrary.savedPresets());
  libraryAssets = computed(() => this.assetLibrary.savedAssets());

  get currentCategories() {
    if (this.activeTab === 'Library') {
       return [
         { id: 'lib_projects', name: 'Sessions', icon: 'folder_special' },
         { id: 'lib_presets', name: 'Presets / FX', icon: 'settings_input_component' },
         { id: 'lib_assets', name: 'Sound Clips', icon: 'audio_file' },
         { id: 'lib_recorder', name: 'Vocal Mic', icon: 'mic_external_on' }
       ];
    }
    if (this.activeTab === 'Plugins') return this.pluginCats;
    if (this.activeTab === 'Loops') return [{ id: 'loops', name: 'Loops', icon: 'loop' }];
    return this.categories;
  }

  // Search results filtration mapping
  get filteredItems() {
    const rawItems = this.itemsDb[this.activeCategory] || [];
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return rawItems;
    return rawItems.filter(item => item.name.toLowerCase().includes(query));
  }

  setTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'Plugins') {
       this.selectCategory('inst');
    } else if (tab === 'Loops') {
       this.selectCategory('loops');
    } else if (tab === 'Library') {
       this.selectCategory('lib_projects');
    } else {
       this.selectCategory('drums');
    }
  }

  selectCategory(id: string) {
    this.activeCategory = id;
    this.currentItems = this.itemsDb[id] || [];
    
    // Default preview item
    if (id.startsWith('lib_')) {
       this.activeSample = null;
    } else {
       const filtered = this.filteredItems;
       if (filtered.length > 0) {
         this.activeSample = filtered[0].name;
         const item = filtered[0];
         if (item && item.url) {
           this.workspace.activeSample.set(item);
         }
       }
    }
  }

  ngOnInit() {
    this.workspace.activeSample.set(this.currentItems[0]);
  }

  playSample(name: string) {
     this.activeSample = name;
     const item = this.currentItems.find(i => i.name === name);
     if (item) this.workspace.activeSample.set(item);
     
     // Only play audio demo for actual sound samples or loops
     if (this.activeTab !== 'Plugins' && item?.url) {
       this.audio.playOneShot(name, item.url);
       this.previewing = true;
       
       if (this.previewTimeout) clearTimeout(this.previewTimeout);
       this.previewTimeout = setTimeout(() => {
          this.previewing = false;
       }, 300);
     } else if (this.activeTab === 'Plugins') {
       this.previewing = true;
       if (this.previewTimeout) clearTimeout(this.previewTimeout);
       this.previewTimeout = setTimeout(() => {
          this.previewing = false;
       }, 300);
     }
  }

  getPluginPreset(name: string | null) {
    if (!name) return null;
    return this.presetsDb[name] || null;
  }

  loadPluginPreset() {
    const presetName = this.activeSample;
    if (!presetName) {
      this.showToast('Selecione um preset primeiro');
      return;
    }
    
    const preset = this.getPluginPreset(presetName);
    if (!preset) {
      this.showToast(`Preset: ${presetName} configurado`);
      return;
    }

    if (preset.type === 'instrument') {
      if (preset.synthParams) {
        this.audio.updateSynthParams(preset.synthParams);
        this.showToast(`Sintetizador: ${preset.name} carregado`);
        this.audio.playOneShot('C4');
      }
    } else if (preset.type === 'effect') {
      const selectedId = this.workspace.selectedTrackId();
      if (!selectedId) {
        this.showToast('Selecione uma faixa no painel para aplicar o efeito');
        return;
      }
      
      const track = this.project.tracks().find(t => t.id === selectedId);
      if (!track) {
         this.showToast('Faixa correspondente não existe');
         return;
      }

      if (preset.params) {
        this.project.updateTrack(selectedId, preset.params);
        this.showToast(`Efeito ${preset.name} aplicado na faixa ${track.name}!`);
        this.audio.playOneShot('C3');
      }
    }
  }

  // --- ACTIONS FOR OFFLINE LIBRARY TAB ---
  saveProject(customName: string) {
    const proj = this.assetLibrary.saveProjectOffline(customName);
    this.showToast(`Sessão "${proj.name}" salva offline!`);
  }

  loadProject(proj: OfflineProject) {
    this.assetLibrary.loadProjectOffline(proj);
    
    // Play a shiny synthetic notification sound chord
    this.audio.playOneShot('C3');
    setTimeout(() => this.audio.playOneShot('E3'), 120);
    setTimeout(() => this.audio.playOneShot('G3'), 240);
    setTimeout(() => this.audio.playOneShot('C4'), 360);
    
    this.showToast(`SESSÃO "${proj.name.toUpperCase()}" CARREGADA!`);
  }

  deleteProject(id: string) {
    this.assetLibrary.deleteProjectOffline(id);
    this.showToast("Projeto deletado da biblioteca local.");
  }

  getSelectedTrackName(): string {
    const id = this.workspace.selectedTrackId();
    if (!id) return '';
    const track = this.project.tracks().find(t => t.id === id);
    return track ? track.name : '';
  }

  savePreset(customName: string) {
    const preset = this.assetLibrary.saveSynthPresetOffline(customName);
    this.showToast(`Amostra de som "${preset.name}" arquivada!`);
  }

  saveFxPreset(customName: string) {
    const activeTrackId = this.workspace.selectedTrackId();
    if (!activeTrackId) {
      this.showToast('Selecione uma faixa para gravar os plugins/FX');
      return;
    }
    const track = this.project.tracks().find(t => t.id === activeTrackId);
    if (!track) {
      this.showToast('Faixa selecionada não encontrada');
      return;
    }
    const preset = this.assetLibrary.saveFxPresetOffline(customName, track);
    this.showToast(`Efeitos da faixa "${track.name}" salvos como "${preset.name}"!`);
  }

  loadPreset(preset: OfflinePreset) {
    if (preset.type === 'synth') {
      this.assetLibrary.loadPresetOffline(preset);
      this.audio.playOneShot('C4');
      this.showToast(`Preset "${preset.name}" aplicado ao Synth!`);
    } else if (preset.type === 'fx') {
      const activeTrackId = this.workspace.selectedTrackId();
      if (!activeTrackId) {
        this.showToast('Selecione uma faixa no painel para aplicar o efeito');
        return;
      }
      const track = this.project.tracks().find(t => t.id === activeTrackId);
      this.assetLibrary.loadPresetOffline(preset);
      this.audio.playOneShot('C3');
      this.showToast(`Plugins/FX "${preset.name}" aplicados na faixa ${track ? track.name : ''}!`);
    }
  }

  deletePreset(id: string) {
    this.assetLibrary.deletePresetOffline(id);
    this.showToast("Preset removido da biblioteca.");
  }

  // Handle disk choice import
  onFileUploaded(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      this.assetLibrary.importAudioFileOffline(file).then((sound) => {
         this.showToast(`Importado: ${sound.name}`);
         this.audio.customAssetUrlMap.set(sound.name, sound.blobUrl || '');
      });
    }
  }

  playLocalAsset(sound: OfflineAsset) {
    this.activeSample = sound.name;
    this.workspace.activeSample.set({ name: sound.name, url: sound.blobUrl });
    
    if (sound.blobUrl) {
       this.audio.playOneShot(sound.name, sound.blobUrl);
       this.previewing = true;
       if (this.previewTimeout) clearTimeout(this.previewTimeout);
       this.previewTimeout = setTimeout(() => {
          this.previewing = false;
       }, 400);
    }
  }

  deleteAsset(id: string) {
    this.assetLibrary.deleteAssetOffline(id);
    this.showToast("Som local deletado.");
  }

  // Recording controls
  toggleRecorderMode() {
    if (this.assetLibrary.isRecording()) {
       this.assetLibrary.stopMicRecording();
       this.showToast("Gravação salva na lista de Clips!");
    } else {
       this.assetLibrary.startMicRecording().then(() => {
          this.showToast("Gravando voz... Fale próximo ao microfone.");
       }).catch(() => {
          this.showToast("Erro: Microfone indisponível ou recusado.");
       });
    }
  }

  // Trigger preview in bottom-panel/waveform from play icon
  clickPlayTrigger() {
    if (!this.activeSample) return;
    
    // Check if the currently active sound is in our library
    const libSound = this.assetLibrary.savedAssets().find(a => a.name === this.activeSample);
    if (libSound) {
       this.playLocalAsset(libSound);
    } else {
       this.playSample(this.activeSample);
    }
  }

  formatDuration(sec: number): string {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  showToast(message: string) {
    this.toastMessage.set(message);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage.set(null);
    }, 2800);
  }

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  clearSearch() {
    this.searchQuery.set('');
  }

  onDragStart(event: DragEvent, item: string) {
    if (event.dataTransfer) {
       event.dataTransfer.setData('text/plain', item);
       event.dataTransfer.effectAllowed = 'copy';
       
       // Register mapping just to be certain
       const libSound = this.assetLibrary.savedAssets().find(a => a.name === item);
       if (libSound && libSound.blobUrl) {
          this.audio.customAssetUrlMap.set(item, libSound.blobUrl);
       }
    }
  }
}
