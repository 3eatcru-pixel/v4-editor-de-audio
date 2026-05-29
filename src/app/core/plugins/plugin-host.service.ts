import { Injectable, signal, PLATFORM_ID, inject, effect } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { PluginInstance, PluginType, PluginParameter, FxChain, PluginPreset, SendChannel, SubmixBus } from "./plugin-types";
import { ProjectService, Track } from "../project.service";
import { WorkspaceService } from "../workspace.service";

@Injectable({ providedIn: "root" })
export class PluginHostService {
  private platformId = inject(PLATFORM_ID);
  private project = inject(ProjectService);
  private workspace = inject(WorkspaceService);

  private audioCtx: AudioContext | null = null;
  
  // High-performance track FX chains mappings
  trackFxChains = signal<Map<string, FxChain>>(new Map());
  
  // Sends, Submixes and Master
  sendChannels = signal<SendChannel[]>([
    { id: "send_a", name: "Reverb Bus Send (Shared)", volume: 0.5, pan: 0, mute: false, fxChain: [] },
    { id: "send_b", name: "Stereo Delay Bus Send (Shared)", volume: 0.3, pan: 0, mute: false, fxChain: [] }
  ]);
  
  submixBuses = signal<SubmixBus[]>([
    { id: "bus_drums", name: "Drums Group Bus", volume: 0.9, pan: 0, mute: false, solo: false, fxChain: [] },
    { id: "bus_vocals", name: "Vox Group Bus", volume: 0.95, pan: 0, mute: false, solo: false, fxChain: [] }
  ]);

  // Master Bus custom chain
  masterFxChain = signal<PluginInstance[]>([]);

  // Active floating/docked plugin editor window
  activePluginEditId = signal<string | null>(null);

  // Array of currently floating/detached plugins
  floatingPlugins = signal<{
    pluginId: string;
    trackId: string;
    x: number;
    y: number;
    minimized?: boolean;
    zIndex: number;
  }[]>([]);

  // Toggle/set plugin float state
  public detachPlugin(trackId: string, pluginId: string, initialX?: number, initialY?: number) {
    const list = this.floatingPlugins();
    // Check if already floating
    if (list.some(fp => fp.pluginId === pluginId)) {
      this.bringToFront(pluginId);
      return;
    }

    const nextIndex = list.length;
    const x = initialX ?? (120 + (nextIndex % 6) * 35);
    const y = initialY ?? (120 + (nextIndex % 6) * 35);
    
    // Find highest z-index
    const maxZ = list.reduce((max, fp) => Math.max(max, fp.zIndex), 100);

    this.floatingPlugins.update(curr => [
      ...curr,
      {
        pluginId,
        trackId,
        x,
        y,
        minimized: false,
        zIndex: maxZ + 1
      }
    ]);
    this.workspace.showToast("Plugin Detached", "Effect editor moved to a floating window.");
  }

  public dockPlugin(pluginId: string) {
    this.floatingPlugins.update(list => list.filter(fp => fp.pluginId !== pluginId));
    this.workspace.showToast("Plugin Docked", "Effect editor docked back to the bottom rack.");
  }

  public minimizeFloatingPlugin(pluginId: string) {
    this.floatingPlugins.update(list => list.map(fp => {
      if (fp.pluginId === pluginId) {
        return { ...fp, minimized: !fp.minimized };
      }
      return fp;
    }));
  }

  public updateFloatingPluginPosition(pluginId: string, x: number, y: number) {
    this.floatingPlugins.update(list => list.map(fp => {
      if (fp.pluginId === pluginId) {
        return { ...fp, x, y };
      }
      return fp;
    }));
  }

  public bringToFront(pluginId: string) {
    const list = this.floatingPlugins();
    if (list.length === 0) return;
    
    const maxZ = list.reduce((max, fp) => Math.max(max, fp.zIndex), 100);
    
    this.floatingPlugins.update(curr => curr.map(fp => {
      if (fp.pluginId === pluginId) {
        return { ...fp, zIndex: maxZ + 1 };
      }
      return fp;
    }));
  }

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initDefaultChains();
    }

    // Effect to monitor track structure changes and load/sync chain mappings
    effect(() => {
      const tracks = this.project.tracks();
      this.syncTracksWithChains(tracks);
    });
  }

  private initDefaultChains() {
    const chainMap = new Map<string, FxChain>();
    
    // Auto-create a Pultec EQ & Urei FET Compressor for Drum Track (t1)
    chainMap.set("t1", {
      trackId: "t1",
      plugins: [
        this.createPlugin("eq", "SSL 4000 Console EQ"),
        this.createPlugin("compressor", "Urei 1176 Punch Comp")
      ]
    });

    // Auto-create Reverb on Send A
    this.sendChannels.update(sends => {
      const updated = [...sends];
      updated[0].fxChain = [this.createPlugin("reverb", "Space Cathedral Reverb")];
      // Set Reverb mix to 100% wet for send/return configurations
      const wet = updated[0].fxChain[0].parameters.find(p => p.id === "mix");
      if (wet) wet.value = 1.0;
      return updated;
    });

    // Auto-create Stereo Tape Delay on Send B
    this.sendChannels.update(sends => {
      const updated = [...sends];
      updated[1].fxChain = [this.createPlugin("delay", "Tape Echo Delay")];
      const wet = updated[1].fxChain[0].parameters.find(p => p.id === "mix");
      if (wet) wet.value = 1.0;
      return updated;
    });

    this.trackFxChains.set(chainMap);
  }

  private syncTracksWithChains(tracks: Track[]) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      let updated = false;

      // Ensure every track has a mapping
      for (const track of tracks) {
        if (!newMap.has(track.id)) {
          newMap.set(track.id, {
            trackId: track.id,
            plugins: []
          });
          updated = true;
        }
      }

      // Cleanup deleted track maps
      for (const key of newMap.keys()) {
        if (!tracks.find(t => t.id === key)) {
          newMap.delete(key);
          updated = true;
        }
      }

      return updated ? newMap : currentChains;
    });
  }

  public createPlugin(type: PluginType, name?: string): PluginInstance {
    const id = "pl_" + Math.random().toString(36).substring(2, 9);
    const resolvedName = name || this.getDefaultNameForType(type);
    const category = this.getCategoryForType(type);
    const defaultParams = this.getDefaultParamsForType(type);

    return {
      id,
      name: resolvedName,
      type,
      category,
      enabled: true,
      bypass: false,
      latency: this.getLatencyForType(type),
      parameters: defaultParams
    };
  }

  private getDefaultNameForType(type: PluginType): string {
    switch (type) {
      case "eq": return "EQ-3 Parametric";
      case "compressor": return "Studio G-Comp";
      case "limiter": return "Brickwall Guard";
      case "reverb": return "Hall Space Echo";
      case "delay": return "Tape Echo Delay";
      case "distortion": return "Tube Saturation";
      case "chorus": return "Multi-Phase Chorus";
      case "phaser": return "Analog sweep Phaser";
      case "synth": return "Subtractive Osc Synth";
      case "sampler": return "Direct Sampler Pad";
      case "arpeggiator": return "MIDI Arpeggiator";
      case "chord-gen": return "MIDI Chord Generator";
      case "scale-lock": return "MIDI Scale Lock";
      case "humanizer": return "MIDI Humanizer Jitter";
    }
  }

  private getCategoryForType(type: PluginType): "fx" | "instrument" | "midi-fx" {
    if (["synth", "sampler"].includes(type)) return "instrument";
    if (["arpeggiator", "chord-gen", "scale-lock", "humanizer"].includes(type)) return "midi-fx";
    return "fx";
  }

  private getLatencyForType(type: PluginType): number {
    if (type === "limiter") return 128; // Brickwall lookup window
    if (type === "reverb") return 64;  // FFT convolution delay
    return 0;
  }

  private getDefaultParamsForType(type: PluginType): PluginParameter[] {
    switch (type) {
      case "eq":
        return [
          { id: "low_gain", name: "Low Gain", value: 0, min: -15, max: 15, unit: "dB" },
          { id: "low_freq", name: "Low Freq", value: 240, min: 40, max: 800, unit: "Hz" },
          { id: "mid_gain", name: "Mid Gain", value: 0, min: -15, max: 15, unit: "dB" },
          { id: "mid_freq", name: "Mid Freq", value: 1000, min: 400, max: 4000, unit: "Hz" },
          { id: "mid_q", name: "Mid Q", value: 1.0, min: 0.1, max: 10, unit: "" },
          { id: "high_gain", name: "High Gain", value: 0, min: -15, max: 15, unit: "dB" },
          { id: "high_freq", name: "High Freq", value: 3600, min: 2000, max: 16000, unit: "Hz" }
        ];
      case "compressor":
        return [
          { id: "threshold", name: "Threshold", value: -18, min: -60, max: 0, unit: "dB" },
          { id: "ratio", name: "Ratio", value: 4, min: 1, max: 20, unit: ":1" },
          { id: "attack", name: "Attack", value: 0.03, min: 0.001, max: 0.2, unit: "s" },
          { id: "release", name: "Release", value: 0.15, min: 0.01, max: 1.0, unit: "s" },
          { id: "makeup", name: "Makeup Gain", value: 0, min: 0, max: 12, unit: "dB" }
        ];
      case "limiter":
        return [
          { id: "ceiling", name: "Ceiling", value: -0.1, min: -12, max: 0, unit: "dB" },
          { id: "threshold", name: "Threshold", value: 0, min: -18, max: 0, unit: "dB" },
          { id: "release", name: "Release", value: 0.08, min: 0.01, max: 0.5, unit: "s" }
        ];
      case "reverb":
        return [
          { id: "decay", name: "Decay Time", value: 2.2, min: 0.2, max: 10.0, unit: "s" },
          { id: "mix", name: "Wet/Dry Mix", value: 0.25, min: 0, max: 1, unit: "" },
          { id: "hicut", name: "High Cutoff", value: 4500, min: 1000, max: 20000, unit: "Hz" }
        ];
      case "delay":
        return [
          { id: "time", name: "Delay Time", value: 0.25, min: 0.05, max: 2.0, unit: "s" },
          { id: "feedback", name: "Feedback", value: 0.35, min: 0, max: 0.95, unit: "" },
          { id: "mix", name: "Wet/Dry Mix", value: 0.15, min: 0, max: 1, unit: "" },
          { id: "hicut", name: "High Cutoff", value: 2500, min: 500, max: 10000, unit: "Hz" }
        ];
      case "distortion":
        return [
          { id: "drive", name: "Drive Gain", value: 15, min: 0, max: 100, unit: "%" },
          { id: "mix", name: "Saturation Mix", value: 0.15, min: 0, max: 1, unit: "" },
          { id: "tone", name: "Distortion Tone", value: 2000, min: 200, max: 10000, unit: "Hz" }
        ];
      case "chorus":
        return [
          { id: "rate", name: "LFO Rate", value: 1.0, min: 0.1, max: 10, unit: "Hz" },
          { id: "depth", name: "Depth Amount", value: 0.25, min: 0, max: 1, unit: "" },
          { id: "mix", name: "Chorus Mix", value: 0.20, min: 0, max: 1, unit: "" }
        ];
      case "phaser":
        return [
          { id: "rate", name: "Phaser Speed", value: 0.6, min: 0.05, max: 5.0, unit: "Hz" },
          { id: "depth", name: "Depth Amount", value: 0.4, min: 0, max: 1, unit: "" },
          { id: "feedback", name: "Feedback", value: 0.5, min: 0, max: 0.9, unit: "" }
        ];
      case "synth":
        return [
          { id: "wave_type", name: "OSC Waveform", value: 0, min: 0, max: 3, unit: "wave" }, // 0=saw, 1=square, 2=sine, 3=tri
          { id: "cutoff", name: "Filter Cutoff", value: 1400, min: 50, max: 20000, unit: "Hz" },
          { id: "resonance", name: "Resonance Q", value: 2.0, min: 0.1, max: 18.0, unit: "" },
          { id: "attack", name: "Amp Attack", value: 0.02, min: 0.001, max: 1.5, unit: "s" },
          { id: "release", name: "Amp Release", value: 0.35, min: 0.01, max: 3.0, unit: "s" },
          { id: "octave", name: "Octave offset", value: 0, min: -2, max: 2, unit: "oct" }
        ];
      case "sampler":
        return [
          { id: "pitch", name: "Pitch Semitones", value: 0, min: -12, max: 12, unit: "st" },
          { id: "decay", name: "Sampler Decay", value: 1.0, min: 0.05, max: 5.0, unit: "s" },
          { id: "start", name: "Start Point Offset", value: 0, min: 0, max: 100, unit: "%" },
          { id: "end", name: "End Point Cutoff", value: 100, min: 10, max: 100, unit: "%" }
        ];
      case "arpeggiator":
        return [
          { id: "rate", name: "Arp Step Sync", value: 2, min: 0, max: 3, unit: "sync" }, // 0=1/4, 1=1/8, 2=1/16, 3=1/32
          { id: "mode", name: "Pattern Order", value: 0, min: 0, max: 2, unit: "order" }, // 0=up, 1=down, 2=random
          { id: "octaves", name: "Octave Range", value: 1, min: 1, max: 4, unit: "oct" }
        ];
      case "chord-gen":
        return [
          { id: "chord_type", name: "Form Chord", value: 0, min: 0, max: 5, unit: "type" } // 0=Maj, 1=Min, 2=Dom7, 3=Maj7, 4=Min7, 5=Sus4
        ];
      case "scale-lock":
        return [
          { id: "scale", name: "Scale Constrain", value: 0, min: 0, max: 3, unit: "scale" } // 0=Major, 1=Minor, 2=Pentatonic, 3=Dorian
        ];
      case "humanizer":
        return [
          { id: "timing", name: "Time Micro Jitter", value: 10, min: 0, max: 150, unit: "ms" },
          { id: "velocity", name: "Velocity Jitter", value: 15, min: 0, max: 50, unit: "vel" }
        ];
    }
  }

  // Add Plugin into a track FX chain
  public addPluginToTrack(trackId: string, type: PluginType, index?: number): PluginInstance | null {
    let result: PluginInstance | null = null;
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId) || { trackId, plugins: [] };
      const plugin = this.createPlugin(type);
      
      const updatedPlugins = [...chain.plugins];
      if (index !== undefined && index >= 0 && index <= updatedPlugins.length) {
        updatedPlugins.splice(index, 0, plugin);
      } else {
        updatedPlugins.push(plugin);
      }
      
      newMap.set(trackId, { ...chain, plugins: updatedPlugins });
      result = plugin;
      return newMap;
    });

    this.project.saveToStorage();
    this.workspace.showToast("Plugin Added", `Loaded ${this.getDefaultNameForType(type)} in the FX deck.`);
    return result;
  }

  // Remove plugin from track chain
  public removePluginFromTrack(trackId: string, pluginId: string) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId);
      if (chain) {
        newMap.set(trackId, {
          ...chain,
          plugins: chain.plugins.filter(p => p.id !== pluginId)
        });
      }
      return newMap;
    });
    
    if (this.activePluginEditId() === pluginId) {
      this.activePluginEditId.set(null);
    }
    this.floatingPlugins.update(list => list.filter(fp => fp.pluginId !== pluginId));

    this.project.saveToStorage();
    this.workspace.showToast("Plugin Removed", "Deleted effect instance from channel strip.");
  }

  // Re-order plugin (Ableton Live device chains swap)
  public movePluginInTrack(trackId: string, fromIndex: number, toIndex: number) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId);
      if (chain) {
        const plugins = [...chain.plugins];
        const [moved] = plugins.splice(fromIndex, 1);
        plugins.splice(toIndex, 0, moved);
        newMap.set(trackId, { ...chain, plugins });
      }
      return newMap;
    });
    this.project.saveToStorage();
    this.workspace.showToast("Chains Re-ordered", "Plugin execution sequence modified.");
  }

  // Toggle bypass on a plugin
  public togglePluginBypass(trackId: string, pluginId: string) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId);
      if (chain) {
        const plugins = chain.plugins.map(p => {
          if (p.id === pluginId) {
            const newBypass = !p.bypass;
            this.workspace.showToast(newBypass ? "Plugin Bypassed" : "Plugin Enabled", `${p.name} processing updated.`);
            return { ...p, bypass: newBypass };
          }
          return p;
        });
        newMap.set(trackId, { ...chain, plugins });
      }
      return newMap;
    });
  }

  // Update plugin parameter value
  public updatePluginParameter(trackId: string, pluginId: string, paramId: string, value: number) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId);
      if (chain) {
        const plugins = chain.plugins.map(p => {
          if (p.id === pluginId) {
            const parameters = p.parameters.map(param => {
              if (param.id === paramId) {
                // Constrain to limits
                const constrained = Math.max(param.min, Math.min(param.max, value));
                return { ...param, value: constrained };
              }
              return param;
            });
            return { ...p, parameters };
          }
          return p;
        });
        newMap.set(trackId, { ...chain, plugins });
      }
      return newMap;
    });
  }

  // Apply custom preset values into a plugin
  public applyPresetToPlugin(trackId: string, pluginId: string, preset: PluginPreset) {
    this.trackFxChains.update(currentChains => {
      const newMap = new Map<string, FxChain>(currentChains);
      const chain = newMap.get(trackId);
      if (chain) {
        const plugins = chain.plugins.map(p => {
          if (p.id === pluginId) {
            const parameters = p.parameters.map(param => {
              if (preset.parameters[param.id] !== undefined) {
                return { ...param, value: preset.parameters[param.id] };
              }
              return param;
            });
            return { ...p, parameters, activePresetId: preset.id };
          }
          return p;
        });
        newMap.set(trackId, { ...chain, plugins });
      }
      return newMap;
    });
    this.workspace.showToast("Preset Loaded", `Applied '${preset.name}' coordinates.`);
  }

  // Create real-time DSP nodes graph inside track routing context
  public createAudioGraphForPlugin(ctx: AudioContext, plugin: PluginInstance, trackId?: string): {
    input: AudioNode;
    output: AudioNode;
    update: (now: number) => void;
  } {
    let input: AudioNode;
    let output: AudioNode;
    let update: (now: number) => void = () => { /* no-op */ };

    const findParam = (pid: string) => {
      if (trackId) {
        const chain = this.trackFxChains().get(trackId);
        const livePlugin = chain?.plugins.find(p => p.id === plugin.id);
        if (livePlugin) {
          const param = livePlugin.parameters.find(p => p.id === pid);
          if (param) return param.value;
        }
      }
      return plugin.parameters.find(p => p.id === pid)?.value ?? 0;
    };

    switch (plugin.type) {
      case "eq": {
        const hpf = ctx.createBiquadFilter();
        hpf.type = "highpass";
        hpf.frequency.setValueAtTime(50, ctx.currentTime);

        const low = ctx.createBiquadFilter();
        low.type = "lowshelf";

        const mid = ctx.createBiquadFilter();
        mid.type = "peaking";

        const high = ctx.createBiquadFilter();
        high.type = "highshelf";

        hpf.connect(low);
        low.connect(mid);
        mid.connect(high);

        input = hpf;
        output = high;

        update = (now: number) => {
          if (plugin.bypass) {
            hpf.frequency.setTargetAtTime(10, now, 0.05);
            low.gain.setTargetAtTime(0, now, 0.05);
            mid.gain.setTargetAtTime(0, now, 0.05);
            high.gain.setTargetAtTime(0, now, 0.05);
          } else {
            low.frequency.setTargetAtTime(findParam("low_freq"), now, 0.05);
            low.gain.setTargetAtTime(findParam("low_gain"), now, 0.05);
            mid.frequency.setTargetAtTime(findParam("mid_freq"), now, 0.05);
            mid.gain.setTargetAtTime(findParam("mid_gain"), now, 0.05);
            mid.Q.setTargetAtTime(findParam("mid_q"), now, 0.05);
            high.frequency.setTargetAtTime(findParam("high_freq"), now, 0.05);
            high.gain.setTargetAtTime(findParam("high_gain"), now, 0.05);
          }
        };
        break;
      }
      case "compressor": {
        const comp = ctx.createDynamicsCompressor();
        const makeup = ctx.createGain();
        comp.connect(makeup);

        input = comp;
        output = makeup;

        update = (now: number) => {
          if (plugin.bypass) {
            comp.threshold.setTargetAtTime(0, now, 0.05);
            comp.ratio.setTargetAtTime(1.0, now, 0.05);
            makeup.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            comp.threshold.setTargetAtTime(findParam("threshold"), now, 0.05);
            comp.ratio.setTargetAtTime(findParam("ratio"), now, 0.05);
            comp.attack.setTargetAtTime(findParam("attack"), now, 0.05);
            comp.release.setTargetAtTime(findParam("release"), now, 0.05);
            
            const dbVal = findParam("makeup");
            const ampFactor = Math.pow(10, dbVal / 20); // convert dB to gain
            makeup.gain.setTargetAtTime(ampFactor, now, 0.05);
          }
        };
        break;
      }
      case "limiter": {
        const comp = ctx.createDynamicsCompressor();
        input = comp;
        output = comp;

        update = (now: number) => {
          if (plugin.bypass) {
            comp.threshold.setTargetAtTime(0, now, 0.05);
            comp.ratio.setTargetAtTime(1.0, now, 0.05);
          } else {
            // Limits are rapid, ratio is maximum
            comp.threshold.setTargetAtTime(findParam("ceiling") - 0.2, now, 0.01);
            comp.ratio.setTargetAtTime(20.0, now, 0.01);
            comp.attack.setTargetAtTime(0.001, now, 0.01); // Instant attack
            comp.release.setTargetAtTime(findParam("release"), now, 0.02);
          }
        };
        break;
      }
      case "reverb": {
        const inputGain = ctx.createGain();
        const outputWet = ctx.createGain();
        const outputDry = ctx.createGain();
        const convolver = ctx.createConvolver();
        const hiFilter = ctx.createBiquadFilter();
        hiFilter.type = "lowpass";

        // Synthetic procedural studio space reverb decay loader
        let currentDecayLength = -1;
        const rebuildRoomResponse = (decay: number) => {
          if (currentDecayLength === decay) return;
          currentDecayLength = decay;
          const rate = ctx.sampleRate;
          const length = rate * Math.max(0.1, decay);
          const impulse = ctx.createBuffer(2, length, rate);
          const left = impulse.getChannelData(0);
          const right = impulse.getChannelData(1);

          for (let i = 0; i < length; i++) {
            const percent = i / length;
            const decayFactor = Math.exp(-9 * percent);
            left[i] = (Math.random() * 2 - 1) * decayFactor * 0.45;
            right[i] = (Math.random() * 2 - 1) * decayFactor * 0.45;
          }
          convolver.buffer = impulse;
        };

        inputGain.connect(convolver);
        convolver.connect(hiFilter);
        hiFilter.connect(outputWet);
        inputGain.connect(outputDry);

        // Connect output merger
        const merger = ctx.createGain();
        outputWet.connect(merger);
        outputDry.connect(merger);

        input = inputGain;
        output = merger;

        update = (now: number) => {
          if (plugin.bypass) {
            outputWet.gain.setTargetAtTime(0, now, 0.05);
            outputDry.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            const mix = findParam("mix");
            const decay = findParam("decay");
            rebuildRoomResponse(decay);

            outputWet.gain.setTargetAtTime(mix, now, 0.05);
            outputDry.gain.setTargetAtTime(1.0 - mix, now, 0.05);
            hiFilter.frequency.setTargetAtTime(findParam("hicut"), now, 0.05);
          }
        };
        break;
      }
      case "delay": {
        const inputGain = ctx.createGain();
        const delayNode = ctx.createDelay(4.0);
        const fbGain = ctx.createGain();
        const hiFilter = ctx.createBiquadFilter();
        const wetGain = ctx.createGain();
        const dryGain = ctx.createGain();

        hiFilter.type = "lowpass";

        // Wet signal echo path
        inputGain.connect(delayNode);
        delayNode.connect(hiFilter);
        hiFilter.connect(fbGain);
        fbGain.connect(delayNode); // feedback loop
        hiFilter.connect(wetGain);

        // Dry signal path
        inputGain.connect(dryGain);

        const merger = ctx.createGain();
        wetGain.connect(merger);
        dryGain.connect(merger);

        input = inputGain;
        output = merger;

        update = (now: number) => {
          if (plugin.bypass) {
            wetGain.gain.setTargetAtTime(0, now, 0.05);
            dryGain.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            const mix = findParam("mix");
            delayNode.delayTime.setTargetAtTime(findParam("time"), now, 0.1);
            fbGain.gain.setTargetAtTime(Math.min(0.95, findParam("feedback")), now, 0.05);
            hiFilter.frequency.setTargetAtTime(findParam("hicut"), now, 0.05);
            
            wetGain.gain.setTargetAtTime(mix, now, 0.05);
            dryGain.gain.setTargetAtTime(1.0 - mix, now, 0.05);
          }
        };
        break;
      }
      case "distortion": {
        const shaper = ctx.createWaveShaper();
        shaper.oversample = "4x";
        const driveGain = ctx.createGain();
        const hiFilter = ctx.createBiquadFilter();
        hiFilter.type = "lowpass";

        const wet = ctx.createGain();
        const dry = ctx.createGain();

        // Shaper curves formulas
        const makeTubeCurve = (amount: number) => {
          const k = amount;
          const n_samples = 44100;
          const curve = new Float32Array(n_samples);
          const deg = Math.PI / 180;
          for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
          }
          return curve;
        };

        driveGain.connect(shaper);
        shaper.connect(hiFilter);
        hiFilter.connect(wet);

        const inputGain = ctx.createGain();
        inputGain.connect(driveGain);
        inputGain.connect(dry);

        const merger = ctx.createGain();
        wet.connect(merger);
        dry.connect(merger);

        input = inputGain;
        output = merger;

        update = (now: number) => {
          if (plugin.bypass) {
            wet.gain.setTargetAtTime(0, now, 0.05);
            dry.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            const driveAmount = findParam("drive");
            const mix = findParam("mix");
            
            driveGain.gain.setTargetAtTime(1.0 + driveAmount * 0.15, now, 0.05);
            shaper.curve = makeTubeCurve(driveAmount);
            hiFilter.frequency.setTargetAtTime(findParam("tone"), now, 0.05);
            
            wet.gain.setTargetAtTime(mix, now, 0.05);
            dry.gain.setTargetAtTime(1.0 - mix, now, 0.05);
          }
        };
        break;
      }
      case "chorus": {
        const inputGain = ctx.createGain();
        const delayUnit = ctx.createDelay(0.1);
        delayUnit.delayTime.value = 0.025; // 25ms offset

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.connect(lfoGain);
        lfoGain.connect(delayUnit.delayTime);
        lfo.start(0);

        const wet = ctx.createGain();
        const dry = ctx.createGain();

        inputGain.connect(delayUnit);
        delayUnit.connect(wet);
        inputGain.connect(dry);

        const merger = ctx.createGain();
        wet.connect(merger);
        dry.connect(merger);

        input = inputGain;
        output = merger;

        update = (now: number) => {
          if (plugin.bypass) {
            wet.gain.setTargetAtTime(0, now, 0.05);
            dry.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            const mix = findParam("mix");
            const depth = findParam("depth");
            
            lfo.frequency.setTargetAtTime(findParam("rate"), now, 0.05);
            lfoGain.gain.setTargetAtTime(depth * 0.005, now, 0.05);
            
            wet.gain.setTargetAtTime(mix, now, 0.05);
            dry.gain.setTargetAtTime(1.0 - mix, now, 0.05);
          }
        };
        break;
      }
      case "phaser": {
        const inputGain = ctx.createGain();
        const ap1 = ctx.createBiquadFilter();
        const ap2 = ctx.createBiquadFilter();
        const ap3 = ctx.createBiquadFilter();
        const ap4 = ctx.createBiquadFilter();
        const feedback = ctx.createGain();

        ap1.type = "allpass";
        ap2.type = "allpass";
        ap3.type = "allpass";
        ap4.type = "allpass";

        inputGain.connect(ap1);
        ap1.connect(ap2);
        ap2.connect(ap3);
        ap3.connect(ap4);
        
        // feedback loop
        ap4.connect(feedback);
        feedback.connect(ap1);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.connect(lfoGain);
        lfoGain.connect(ap1.frequency);
        lfoGain.connect(ap2.frequency);
        lfoGain.connect(ap3.frequency);
        lfoGain.connect(ap4.frequency);
        lfo.start(0);

        const wet = ctx.createGain();
        ap4.connect(wet);
        
        const dry = ctx.createGain();
        inputGain.connect(dry);

        const merger = ctx.createGain();
        wet.connect(merger);
        dry.connect(merger);

        input = inputGain;
        output = merger;

        update = (now: number) => {
          if (plugin.bypass) {
            wet.gain.setTargetAtTime(0, now, 0.05);
            dry.gain.setTargetAtTime(1.0, now, 0.05);
          } else {
            const depth = findParam("depth");
            const rate = findParam("rate");
            
            lfo.frequency.setTargetAtTime(rate, now, 0.05);
            lfoGain.gain.setTargetAtTime(depth * 300, now, 0.05);
            feedback.gain.setTargetAtTime(findParam("feedback"), now, 0.05);
            
            wet.gain.setTargetAtTime(0.5, now, 0.05);
            dry.gain.setTargetAtTime(0.5, now, 0.05);
          }
        };
        break;
      }
      case "synth": {
        // Subtractive synthesis node setup
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();

        osc.connect(filter);
        filter.connect(amp);

        // Treat amp output as both input and output since we manually trigger it
        input = amp;
        output = amp;

        update = (now: number) => {
          const typeVal = findParam("wave_type");
          const waves: OscillatorType[] = ["sawtooth", "square", "sine", "triangle"];
          osc.type = waves[typeVal] || "sawtooth";
          
          filter.type = "lowpass";
          filter.frequency.setTargetAtTime(findParam("cutoff"), now, 0.05);
          filter.Q.setTargetAtTime(findParam("resonance"), now, 0.05);
        };
        break;
      }
      default: {
        const pass = ctx.createGain();
        input = pass;
        output = pass;
        update = () => { /* no-op */ };
        break;
      }
    }

    return { input, output, update };
  }

  // Pre-configured preset patches for each DSP hardware module
  public getFactoryPresetsForType(type: PluginType): PluginPreset[] {
    const list: PluginPreset[] = [];
    switch (type) {
      case "eq":
        list.push({
          id: "eq_pultec",
          name: "Vintage Pultec Presence",
          pluginType: "eq",
          parameters: { low_gain: 5.5, low_freq: 200, mid_gain: -1.5, mid_freq: 800, mid_q: 1.2, high_gain: 4.0, high_freq: 4500 }
        });
        list.push({
          id: "eq_clean_cut",
          name: "Vocal High Clarity Cut",
          pluginType: "eq",
          parameters: { low_gain: -3.0, low_freq: 120, mid_gain: 1.0, mid_freq: 2500, mid_q: 0.8, high_gain: 3.0, high_freq: 8000 }
        });
        break;
      case "compressor":
        list.push({
          id: "comp_vocal",
          name: "Silk Opto Vocal",
          pluginType: "compressor",
          parameters: { threshold: -24, ratio: 3.5, attack: 0.045, release: 0.28, makeup: 3.5 }
        });
        list.push({
          id: "comp_drum_glue",
          name: "Mix Glue Compressor",
          pluginType: "compressor",
          parameters: { threshold: -14, ratio: 4.5, attack: 0.012, release: 0.08, makeup: 2.0 }
        });
        break;
      case "reverb":
        list.push({
          id: "rev_hall",
          name: "Cathedral Stone Hall",
          pluginType: "reverb",
          parameters: { decay: 4.8, mix: 0.38, hicut: 3200 }
        });
        list.push({
          id: "rev_plate",
          name: "Saturated Studio Plate",
          pluginType: "reverb",
          parameters: { decay: 1.4, mix: 0.18, hicut: 8000 }
        });
        break;
      case "delay":
        list.push({
          id: "del_dotted_eighth",
          name: "Ambient Echoes Dotted 8th",
          pluginType: "delay",
          parameters: { time: 0.375, feedback: 0.55, mix: 0.22, hicut: 3000 }
        });
        list.push({
          id: "del_slapback",
          name: "Slapback Vintage Tape",
          pluginType: "delay",
          parameters: { time: 0.08, feedback: 0.15, mix: 0.30, hicut: 5000 }
        });
        break;
      case "distortion":
        list.push({
          id: "dist_hot_tube",
          name: "Hot Tube Overdrive",
          pluginType: "distortion",
          parameters: { drive: 45, mix: 0.35, tone: 1800 }
        });
        list.push({
          id: "dist_clean_sheen",
          name: "Soft Warm Tape Saturation",
          pluginType: "distortion",
          parameters: { drive: 8, mix: 0.12, tone: 4000 }
        });
        break;
      case "synth":
        list.push({
          id: "synth_sub_bass",
          name: "Classic Analog Sub Bass",
          pluginType: "synth",
          parameters: { wave_type: 0, cutoff: 180, resonance: 1.5, attack: 0.015, release: 0.22, octave: -1 }
        });
        list.push({
          id: "synth_supersaw",
          name: "Hyperspace Pluck Lead",
          pluginType: "synth",
          parameters: { wave_type: 0, cutoff: 1800, resonance: 4.0, attack: 0.005, release: 0.45, octave: 0 }
        });
        break;
    }
    return list;
  }
}
