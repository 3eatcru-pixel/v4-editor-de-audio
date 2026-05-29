export type PluginType =
  | "eq"
  | "compressor"
  | "limiter"
  | "reverb"
  | "delay"
  | "distortion"
  | "chorus"
  | "phaser"
  | "synth"
  | "sampler"
  | "arpeggiator"
  | "chord-gen"
  | "scale-lock"
  | "humanizer";

export interface PluginParameter {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  unit: string;
}

export interface PluginPreset {
  id: string;
  name: string;
  pluginType: PluginType;
  parameters: Record<string, number>;
}

export interface PluginInstance {
  id: string;
  name: string;
  type: PluginType;
  category: "fx" | "instrument" | "midi-fx";
  enabled: boolean;
  bypass: boolean;
  latency: number; // in samples
  parameters: PluginParameter[];
  activePresetId?: string;
  
  // Audio Nodes (dynamically initialized on host context)
  inputNode?: AudioNode;
  outputNode?: AudioNode;
}

export interface FxChain {
  trackId: string;
  plugins: PluginInstance[];
}

export interface SendChannel {
  id: string; // e.g., 'send_a'
  name: string; // e.g., 'Reverb Send'
  volume: number; // 0..1
  pan: number; // -1..1
  mute: boolean;
  fxChain: PluginInstance[];
}

export interface SubmixBus {
  id: string; // e.g., 'bus_drums'
  name: string; // e.g., 'Drums Bus'
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  fxChain: PluginInstance[];
}
