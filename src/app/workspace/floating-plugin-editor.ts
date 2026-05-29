import { Component, inject, input, computed } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { DragDropModule, CdkDragEnd } from "@angular/cdk/drag-drop";
import { PluginHostService } from "../core/plugins/plugin-host.service";
import { ProjectService } from "../core/project.service";
import { PluginInstance, PluginType } from "../core/plugins/plugin-types";

@Component({
  selector: "app-floating-plugin-editor",
  imports: [MatIconModule, DragDropModule],
  template: `
    @let fp = floatingConfig();
    @let plugin = pluginInstance();
    @if (plugin) {
      <div
        cdkDrag
        [cdkDragFreeDragPosition]="{ x: fp.x, y: fp.y }"
        (cdkDragEnded)="onDragEnded($event, fp.pluginId)"
        (mousedown)="pluginHost.bringToFront(fp.pluginId)"
        [style.zIndex]="fp.zIndex"
        class="absolute pointer-events-auto w-[240px] rounded-lg border flex flex-col shadow-2xl overflow-hidden transition-all duration-100"
        [class]="plugin.bypass ? 'bg-gradient-to-b from-[#111116] to-[#0a0a0d] border-[#22222c] opacity-80' : 'bg-gradient-to-b from-[#1e1e28] to-[#121218] border-[#38384a]'"
      >
        <!-- Windows Header -- Title and utilities -->
        <div
          cdkDragHandle
          class="h-8 pl-3 pr-2 flex items-center justify-between cursor-move select-none border-b shrink-0"
          [class]="plugin.bypass ? 'bg-[#0e0e12] border-[#22222c] text-gray-500' : 'bg-[#252535] border-[#38384a] text-gray-200'"
        >
          <div class="flex items-center gap-1.5 text-[10px] uppercase font-extrabold tracking-widest leading-none">
            <mat-icon class="text-[12px] w-[12px] h-[12px]" [class]="plugin.category === 'midi-fx' ? 'text-amber-500' : 'text-cyan-400'">
              {{ plugin.category === 'midi-fx' ? 'album' : 'graphic_eq' }}
            </mat-icon>
            <span class="truncate max-w-[110px]">{{ plugin.name }}</span>
            <span class="text-[8px] px-1 bg-black/40 rounded text-gray-400 normal-case font-medium ml-1 truncate max-w-[55px] border border-white/5">{{ trackName() }}</span>
          </div>

          <!-- Window commands -->
          <div class="flex items-center gap-1 pointer-events-auto">
            <!-- Minimizer Toggle -->
            <button
              type="button"
              (click)="pluginHost.minimizeFloatingPlugin(fp.pluginId); $event.stopPropagation()"
              class="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-colors"
              [title]="fp.minimized ? 'Maximize Window' : 'Minimize Window'"
            >
              <mat-icon class="text-[12px] w-[12px] h-[12px]">{{ fp.minimized ? 'keyboard_arrow_down' : 'remove' }}</mat-icon>
            </button>

            <!-- Dock back to strip -->
            <button
              type="button"
              (click)="pluginHost.dockPlugin(fp.pluginId); $event.stopPropagation()"
              class="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer transition-colors"
              title="Dock Device to bottom rack"
            >
              <mat-icon class="text-[12px] w-[12px] h-[12px]">push_pin</mat-icon>
            </button>

            <!-- Close overlay window -->
            <button
              type="button"
              (click)="pluginHost.dockPlugin(fp.pluginId); $event.stopPropagation()"
              class="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-red-400 cursor-pointer transition-colors"
              title="Close Panel"
            >
              <mat-icon class="text-[12px] w-[12px] h-[12px]">close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Window parameter body content -->
        @if (!fp.minimized) {
          <div class="p-3.5 flex flex-col gap-3">
            
            <!-- Bypass Toggle and Preset selection -->
            <div class="flex items-center justify-between gap-1.5 bg-black/45 rounded-md border border-white/5 p-2 shrink-0">
              <button
                type="button"
                (click)="pluginHost.togglePluginBypass(fp.trackId, fp.pluginId)"
                [class]="plugin.bypass ? 'text-gray-500 bg-black/30 border-gray-750' : 'text-[#06b6d4] bg-[#06b6d4]/10 border-[#06b6d4]/40'"
                class="flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase px-2 py-1 rounded border cursor-pointer hover:brightness-110 transition-all leading-none"
              >
                <mat-icon class="text-[11px] w-[11px] h-[11px]">power_settings_new</mat-icon>
                {{ plugin.bypass ? 'Bypassed' : 'Active' }}
              </button>

              <select
                (change)="onLoadPreset(fp.trackId, fp.pluginId, $any($event.target).value)"
                class="flex-1 bg-black/70 text-[9px] text-gray-200 px-2 py-1.5 rounded-md border border-white/10 cursor-pointer hover:bg-black hover:border-[#10b981]/50 outline-none select-none"
              >
                <option value="" disabled selected>SELECT PRESET</option>
                @for (p of getPresets(plugin.type); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>

            <!-- Parameters slider rack -->
            <div class="space-y-3 max-h-[220px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-white/10">
              @for (p of plugin.parameters; track p.id) {
                <div class="group flex flex-col bg-[#121218]/50 p-1.5 rounded-md border border-white/[0.02] hover:border-[#06b6d4]/20 transition-all">
                  <div class="flex justify-between items-center text-[9px] font-mono text-gray-400 leading-none mb-1.5">
                    <span class="truncate font-bold tracking-wider uppercase text-gray-450 group-hover:text-white transition-colors">{{ p.name }}</span>
                    <span class="text-[#06b6d4] font-extrabold">{{ p.value.toFixed(p.id === 'attack' || p.id === 'release' || p.id === 'time' ? 3 : 1) }}{{ p.unit }}</span>
                  </div>
                  
                  <input
                    type="range"
                    [min]="p.min"
                    [max]="p.max"
                    [step]="p.id === 'attack' || p.id === 'release' || p.id === 'time' ? 0.005 : p.id === 'ratio' ? 0.5 : 1"
                    [value]="p.value"
                    (input)="onParamChange(fp.trackId, fp.pluginId, p.id, $any($event.target).value)"
                    class="w-full h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer accent-[#06b6d4] focus:outline-none"
                  />
                  
                  <!-- Step value slide indicators -->
                  <div class="flex justify-between text-[7px] text-gray-600 font-mono mt-1 px-0.5 leading-none">
                    <span>{{ p.min }}{{ p.unit }}</span>
                    <span>{{ p.max }}{{ p.unit }}</span>
                  </div>
                </div>
              }
            </div>

            <!-- Tiny design touch - hardware label metadata -->
            <div class="flex items-center justify-between border-t border-white/[0.04] pt-2 text-[7px] font-mono tracking-widest text-gray-600 uppercase select-none leading-none">
              <span>HIFI FLOATING MODULE</span>
              <span>DEV V1.4</span>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      /* CDK drag drop classes styling for fluid transition styling */
      .cdk-drag-preview {
        box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6);
        opacity: 0.9;
      }
      .cdk-drag-placeholder {
        opacity: 0.2;
      }
    `
  ]
})
export class FloatingPluginEditorComponent {
  pluginHost = inject(PluginHostService);
  project = inject(ProjectService);

  floatingConfig = input.required<{
    pluginId: string;
    trackId: string;
    x: number;
    y: number;
    minimized?: boolean;
    zIndex: number;
  }>();

  pluginInstance = computed<PluginInstance | undefined>(() => {
    const config = this.floatingConfig();
    const chain = this.pluginHost.trackFxChains().get(config.trackId);
    return chain?.plugins.find(p => p.id === config.pluginId);
  });

  trackName = computed(() => {
    const config = this.floatingConfig();
    const track = this.project.tracks().find(t => t.id === config.trackId);
    return track ? track.name : "Aux Bus";
  });

  getPresets(type: PluginType) {
    return this.pluginHost.getFactoryPresetsForType(type);
  }

  onLoadPreset(trackId: string, pluginId: string, presetId: string) {
    const type = this.pluginInstance()?.type || 'eq';
    const list = this.pluginHost.getFactoryPresetsForType(type);
    const preset = list.find((p) => p.id === presetId);
    if (preset) {
      this.pluginHost.applyPresetToPlugin(trackId, pluginId, preset);
    }
  }

  onParamChange(trackId: string, pluginId: string, paramId: string, valStr: string) {
    const val = parseFloat(valStr);
    this.pluginHost.updatePluginParameter(trackId, pluginId, paramId, val);
  }

  onDragEnded(event: CdkDragEnd, pluginId: string) {
    const position = event.source.getFreeDragPosition();
    this.pluginHost.updateFloatingPluginPosition(pluginId, position.x, position.y);
  }
}
