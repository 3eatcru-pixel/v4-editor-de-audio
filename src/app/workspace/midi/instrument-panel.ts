import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { InstrumentRackService, DrumPadModel, SynthParams } from "../../core/instruments/instrument-rack.service";
import { MidiSchedulerService } from "../../core/midi/midi-scheduler.service";
import { WorkspaceService } from "../../core/workspace.service";

@Component({
  selector: "app-instrument-panel",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full p-4 overflow-y-auto bg-[#08080c] select-none text-white font-sans text-xs">
      
      <!-- LEFT: MPC Performance Drum Pads (5 columns) -->
      <div class="lg:col-span-5 bg-[#0e0e16] border border-[#1b1b26] p-4 rounded-xl flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <mat-icon class="text-orange-500 text-[18px]">grid_view</mat-icon>
            <span class="font-bold uppercase tracking-widest text-[#f97316]">MPC PATTERN PADS</span>
          </div>
          <span class="text-[9px] font-mono text-zinc-500">PROGRAM A (DRUM RACK)</span>
        </div>

        <!-- 8 Colored Heavy Pads matrix -->
        <div class="grid grid-cols-4 gap-3">
          @for (pad of rack.drumPads(); track pad.id) {
            <button 
              (mousedown)="triggerPad(pad.id)"
              [style.border-color]="pad.color + '40'"
              [style.box-shadow]="activePadId === pad.id ? '0 0 15px ' + pad.color : 'none'"
              [class.bg-zinc-900]="activePadId !== pad.id"
              [class.scale-95]="activePadId === pad.id"
              class="aspect-square rounded-lg border-2 flex flex-col justify-between p-2.5 cursor-pointer select-none transition-all duration-75 text-left outline-none">
              <span class="text-[8px] font-mono text-zinc-500 font-bold">A0{{ pad.id }}</span>
              <span class="text-[9px] font-bold uppercase truncate" [style.color]="pad.color">{{ pad.name }}</span>
            </button>
          }
        </div>

        <!-- Selected Pad parameters customization -->
        <div class="bg-[#14141f] border border-[#222] p-3 rounded-lg flex flex-col gap-2.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-bold text-[#eab308]">PAD EDITOR: {{ selectedPad.name }}</span>
            <span class="font-mono text-zinc-400">Pad 0{{ selectedPad.id }}</span>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <!-- Decay -->
            <div class="flex flex-col gap-1">
              <div class="flex justify-between text-[9px] text-zinc-400 font-mono">
                <span>DECAY LENGTH</span>
                <span>{{ selectedPad.decay }}s</span>
              </div>
              <input type="range" min="0.05" max="1.5" step="0.05" [value]="selectedPad.decay" (input)="updatePadParam('decay', $any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            </div>

            <!-- Tone Pitch -->
            <div class="flex flex-col gap-1">
              <div class="flex justify-between text-[9px] text-zinc-400 font-mono">
                <span>PAD FILTER</span>
                <span>{{ selectedPad.filter }} Hz</span>
              </div>
              <input type="range" min="50" max="12000" step="50" [value]="selectedPad.filter" (input)="updatePadParam('filter', $any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            </div>
          </div>
        </div>

        <!-- Performance modifiers: Note Repeat & Arp (Aka MPC note repeat feature!) -->
        <div class="border-t border-[#1b1b26]/60 pt-3 flex flex-col gap-2">
          <span class="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Note Modifiers</span>
          <div class="grid grid-cols-2 gap-2">
            <!-- Note repeat -->
            <div class="flex flex-col gap-2 bg-[#12121b] p-2.5 rounded border border-[#1e1e2d]">
              <button (click)="toggleNoteRepeat()" [class.bg-[#f97316]]="scheduler.noteRepeatEnabled()" [class.text-white]="scheduler.noteRepeatEnabled()" class="w-full py-1 rounded text-white/70 hover:text-white border border-[#26263a] font-bold text-[10px] cursor-pointer transition-colors bg-transparent uppercase">
                Note Repeat
              </button>
              <div class="flex items-center justify-between text-[9px] mt-1 font-mono">
                <span class="text-zinc-500">SPEED</span>
                <select [value]="scheduler.noteRepeatDivision()" (change)="setNoteRepeatSpeed($any($event.target).value)" class="bg-[#1b1b24] text-white border border-neutral-800 rounded px-1 outline-none">
                  <option value="1/8">1/8 beat</option>
                  <option value="1/16">1/16 beat</option>
                  <option value="1/32">1/32 beat</option>
                </select>
              </div>
            </div>

            <!-- Arpeggiator layout -->
            <div class="flex flex-col gap-2 bg-[#12121b] p-2.5 rounded border border-[#1e1e2d]">
              <button (click)="toggleArpeggiator()" [class.bg-[#3b82f6]]="scheduler.arpEnabled()" [class.text-white]="scheduler.arpEnabled()" class="w-full py-1 rounded text-white/70 hover:text-white border border-[#26263a] font-bold text-[10px] cursor-pointer transition-colors bg-transparent uppercase">
                Arpeggiator
              </button>
              <div class="grid grid-cols-2 gap-1 text-[8px] font-mono">
                <select [value]="scheduler.arpDivision()" (change)="setArpSpeed($any($event.target).value)" class="bg-[#1b1b24] text-white border border-neutral-800 rounded px-0.5 py-0.5 outline-none">
                  <option value="1/8">1/8 speed</option>
                  <option value="1/16">1/16 speed</option>
                  <option value="1/32">1/32 speed</option>
                </select>
                <select [value]="scheduler.arpPattern()" (change)="setArpPattern($any($event.target).value)" class="bg-[#1b1b24] text-white border border-neutral-800 rounded px-0.5 py-0.5 outline-none">
                  <option value="up">Arp Up</option>
                  <option value="down">Arp Down</option>
                  <option value="random">Rnd</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CENTER: Analog Modeling Synthesizer Rack (5 columns) -->
      <div class="lg:col-span-4 bg-[#0e0e16] border border-[#1b1b26] p-4 rounded-xl flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <mat-icon class="text-cyan-400 text-[18px]">waves</mat-icon>
            <span class="font-bold uppercase tracking-widest text-cyan-400">VIRTUAL SYNTH V1</span>
          </div>
          <span class="text-[9px] font-mono text-zinc-500">POLY ANALOG LAYER</span>
        </div>

        <!-- Oscillator selector -->
        <div class="grid grid-cols-4 gap-1.5 p-1 bg-zinc-950 rounded border border-zinc-800/80">
          @for (shape of ['sawtooth', 'square', 'sine', 'triangle']; track shape) {
            <button 
              (click)="updateSynthShape(shape)" 
              [class.bg-[#06b6d4]]="synth.oscType === shape"
              [class.text-white]="synth.oscType === shape"
              class="py-1 rounded text-[9px] uppercase font-mono font-bold cursor-pointer transition-colors border-none bg-transparent text-zinc-500">
              {{ shape.substring(0,4) }}
            </button>
          }
        </div>

        <!-- Filter Controls -->
        <div class="flex flex-col gap-2.5 border-b border-zinc-800/50 pb-3">
          <div class="flex justify-between text-[9px] text-zinc-500 font-mono font-bold uppercase">
            <span>Dynamic Biquad Filter</span>
            <span class="text-cyan-400">{{ synth.filterCutoff }}Hz / {{ synth.filterQ }}Q</span>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <!-- Cutoff -->
            <div class="flex flex-col gap-1">
              <span class="text-[8px] text-zinc-400">CUTOFF FREQ</span>
              <input type="range" min="200" max="8000" step="50" [value]="synth.filterCutoff" (input)="updateSynthParam('filterCutoff', $any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            </div>
            <!-- Resonance -->
            <div class="flex flex-col gap-1">
              <span class="text-[8px] text-zinc-400">RESONANCE (Q)</span>
              <input type="range" min="0.5" max="15" step="0.5" [value]="synth.filterQ" (input)="updateSynthParam('filterQ', $any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 mt-1">
            <!-- Filter Sweep ADSR Mod Depth -->
            <div class="flex flex-col gap-0.5">
              <span class="text-[8px] text-zinc-400">MOD SWEEP (+{{ synth.filterEnvelopeMod }}Hz)</span>
              <input type="range" min="0" max="6000" step="100" [value]="synth.filterEnvelopeMod" (input)="updateSynthParam('filterEnvelopeMod', $any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            </div>
            <!-- LFO speed modulation -->
            <div class="flex flex-col gap-0.5">
              <span class="text-[8px] text-zinc-400">LFO TARGET ({{ synth.lfoTarget.toUpperCase() }})</span>
              <select [value]="synth.lfoTarget" (change)="updateSynthParam('lfoTarget', $any($event.target).value)" class="bg-[#14141f] text-white border border-neutral-800 rounded px-1 py-0.5 outline-none text-[9px]">
                <option value="none">Disabled</option>
                <option value="pitch">Modulate Pitch</option>
                <option value="cutoff">Modulate Cutoff</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Amp ADSR Fader envelopes -->
        <div class="flex flex-col gap-2">
          <span class="text-[9px] text-zinc-500 font-mono font-bold uppercase">Volume Envelope (ADSR)</span>
          <div class="grid grid-cols-4 gap-2 bg-[#12121b] p-3 rounded-lg border border-[#1a1a2b]">
            <div class="flex flex-col items-center gap-1.5">
              <span class="text-[8px] font-mono text-zinc-500 font-bold">ATTACK</span>
              <input type="range" min="0.01" max="1.5" step="0.01" [value]="synth.attack" (input)="updateSynthParam('attack', $any($event.target).value)" class="slider h-20 w-1 bg-zinc-800 appearance-none outline-none rounded orient-vertical webkit-slider-vertical">
              <span class="text-[9px] font-mono text-[#06b6d4] font-bold">{{ synth.attack }}s</span>
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <span class="text-[8px] font-mono text-zinc-500 font-bold">DECAY</span>
              <input type="range" min="0.02" max="2.0" step="0.01" [value]="synth.decay" (input)="updateSynthParam('decay', $any($event.target).value)" class="slider h-20 w-1 bg-zinc-800 appearance-none outline-none rounded orient-vertical webkit-slider-vertical">
              <span class="text-[9px] font-mono text-[#06b6d4] font-bold">{{ synth.decay }}s</span>
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <span class="text-[8px] font-mono text-zinc-500 font-bold">SUSTAIN</span>
              <input type="range" min="0.0" max="1.0" step="0.05" [value]="synth.sustain" (input)="updateSynthParam('sustain', $any($event.target).value)" class="slider h-20 w-1 bg-zinc-800 appearance-none outline-none rounded orient-vertical webkit-slider-vertical">
              <span class="text-[9px] font-mono text-[#06b6d4] font-bold">{{ Math.round(synth.sustain * 100) }}%</span>
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <span class="text-[8px] font-mono text-zinc-500 font-bold">RELEASE</span>
              <input type="range" min="0.02" max="3.0" step="0.02" [value]="synth.release" (input)="updateSynthParam('release', $any($event.target).value)" class="slider h-20 w-1 bg-zinc-800 appearance-none outline-none rounded orient-vertical webkit-slider-vertical">
              <span class="text-[9px] font-mono text-[#06b6d4] font-bold">{{ synth.release }}s</span>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Master Effects Rack console (3 columns) -->
      <div class="lg:col-span-3 bg-[#0e0e16] border border-[#1b1b26] p-4 rounded-xl flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <mat-icon class="text-indigo-400 text-[18px]">equalizer</mat-icon>
          <span class="font-bold uppercase tracking-widest text-indigo-400">FX INSERTS RACK</span>
        </div>

        <div class="flex flex-col gap-4 bg-[#12121b] p-3 rounded-lg border border-[#1a1a2b] flex-1 justify-center">
          
          <!-- Delay effects -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between text-[9px] font-mono text-zinc-400">
              <span>DELAY FEEDBACK</span>
              <span>{{ Math.round(rack.fxDelayMix() * 100) }}% Mix</span>
            </div>
            <input type="range" min="0.0" max="0.8" step="0.05" [value]="rack.fxDelayMix()" (input)="rack.fxDelayMix.set($any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            <div class="flex justify-between text-[8px] font-mono text-zinc-500">
              <span>Feedback damping:</span>
              <span>{{ Math.round(rack.fxDelayFeedback() * 100) }}%</span>
            </div>
            <input type="range" min="0.0" max="0.85" step="0.05" [value]="rack.fxDelayFeedback()" (input)="rack.fxDelayFeedback.set($any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
          </div>

          <div class="h-px bg-zinc-800/40 my-1"></div>

          <!-- Space Reverb -->
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between text-[9px] font-mono text-zinc-400">
              <span>AMBIENT REVERB MIX</span>
              <span>{{ Math.round(rack.fxReverbMix() * 100) }}%</span>
            </div>
            <input type="range" min="0.0" max="0.8" step="0.05" [value]="rack.fxReverbMix()" (input)="rack.fxReverbMix.set($any($event.target).value)" class="slider h-1 bg-zinc-800 appearance-none rounded outline-none">
            <span class="text-[8px] font-mono text-zinc-500">Impulse Decay: 2.5s convolution studio</span>
          </div>
        </div>

        <!-- Master system keyboard triggers helper -->
        <div class="bg-zinc-950 p-3 rounded-lg border border-neutral-800/60 text-center">
          <span class="font-bold text-[9px] text-[#eab308] uppercase tracking-widest block mb-1">🎹 Computer Keyboard Keyboard</span>
          <p class="text-[8px] text-zinc-500 leading-relaxed font-mono">Use home keys <code class="text-white bg-zinc-800 px-0.5 rounded px-1">A S D F G H J K</code> to play piano synthesizers live!</p>
        </div>
      </div>

    </div>
  `,
  styles: [`
    input[type=range] {
      accent-color: #06b6d4;
    }
  `]
})
export class InstrumentPanelComponent {
  rack = inject(InstrumentRackService);
  scheduler = inject(MidiSchedulerService);
  workspace = inject(WorkspaceService);

  activePadId = 0;
  selectedPad: DrumPadModel;
  Math = Math;

  constructor() {
    this.selectedPad = this.rack.drumPads()[0];
  }

  get synth(): SynthParams {
    return this.rack.synthParams();
  }

  triggerPad(padId: number) {
    this.activePadId = padId;
    this.selectedPad = this.rack.drumPads().find((p) => p.id === padId) || this.selectedPad;

    // Trigger synthetic sound immediately using lookahead latency factors
    this.rack.triggerDrumPad(padId, 120, 0);

    setTimeout(() => {
      if (this.activePadId === padId) {
        this.activePadId = 0;
      }
    }, 150);
  }

  updatePadParam(param: "decay" | "filter", val: string) {
    const num = parseFloat(val);
    const pads = this.rack.drumPads().map((p) => {
      if (p.id === this.selectedPad.id) {
        return { ...p, [param]: num };
      }
      return p;
    });
    this.rack.drumPads.set(pads);
    this.selectedPad = { ...this.selectedPad, [param]: num };
  }

  updateSynthShape(type: string) {
    const cfg = this.rack.synthParams();
    this.rack.synthParams.set({ ...cfg, oscType: type as OscillatorType });
  }

  updateSynthParam(param: string, val: string) {
    const isNumber = param !== "lfoTarget" && param !== "filterType" && param !== "oscType";
    const parse = isNumber ? parseFloat(val) : val;
    this.rack.synthParams.set({
      ...this.synth,
      [param]: parse
    });
  }

  setNoteRepeatSpeed(speed: "1/8" | "1/16" | "1/32") {
    this.scheduler.noteRepeatDivision.set(speed);
  }

  setArpSpeed(speed: "1/8" | "1/16" | "1/32") {
    this.scheduler.arpDivision.set(speed);
  }

  setArpPattern(pattern: "up" | "down" | "random") {
    this.scheduler.arpPattern.set(pattern);
  }

  toggleNoteRepeat() {
    this.scheduler.noteRepeatEnabled.set(!this.scheduler.noteRepeatEnabled());
    const text = this.scheduler.noteRepeatEnabled() ? "Note repeat enabled" : "Note repeat deactivated";
    this.workspace.showToast("Note Repeat Triggered", text);
  }

  toggleArpeggiator() {
    this.scheduler.arpEnabled.set(!this.scheduler.arpEnabled());
    const text = this.scheduler.arpEnabled() ? "Arpeggio notes clock triggered (Chord keys)" : "Arp synthesizer bypassed";
    this.workspace.showToast("Arpeggiator Triggered", text);
  }
}
