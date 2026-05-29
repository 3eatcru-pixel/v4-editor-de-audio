import { PluginParameter, PluginType } from "../../plugins/plugin-types";

/**
 * Clean Object-Oriented base class matching Phase 4 modular Plugin API.
 * Defines standard lifecycle methods for processing and serialization.
 */
export abstract class BaseAudioPlugin {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly type: PluginType;
  public abstract parameters: PluginParameter[];
  
  public enabled = true;
  public bypass = false;

  protected audioCtx: AudioContext | null = null;
  public inputNode: AudioNode | null = null;
  public outputNode: AudioNode | null = null;

  /**
   * Bootstraps Web Audio nodes for this plugin in Phase 4 lifecycle.
   */
  public initialize(audioCtx: AudioContext): { input: AudioNode; output: AudioNode } {
    this.audioCtx = audioCtx;
    this.setupNodes();
    if (!this.inputNode || !this.outputNode) {
      // Fallback node design
      const pass = audioCtx.createGain();
      this.inputNode = pass;
      this.outputNode = pass;
    }
    return {
      input: this.inputNode,
      output: this.outputNode
    };
  }

  /**
   * Internal sub-node setup routine to be implemented by children plugins.
   */
  protected abstract setupNodes(): void;

  /**
   * Smoothes parameter sweeps, updates interpolation LFO clocks, or shapes dynamic waveforms.
   */
  public abstract process(now: number): void;

  /**
   * Standardized serialization mapping parameters to simple key-value maps (Phase 4).
   */
  public serialize(): Record<string, number> {
    const data: Record<string, number> = {};
    for (const p of this.parameters) {
      data[p.id] = p.value;
    }
    return data;
  }

  /**
   * Restores parameter faders from saved project templates (Phase 4).
   */
  public restore(state: Record<string, number>) {
    for (const p of this.parameters) {
      if (state[p.id] !== undefined) {
        p.value = state[p.id];
      }
    }
  }

  /**
   * Safe disconnect/teardown routine preventing leaks on plugin terminations.
   */
  public destroy() {
    if (this.inputNode) {
      try {
        this.inputNode.disconnect();
      } catch { /* suppress safe double disconnect errors */ }
      this.inputNode = null;
    }
    if (this.outputNode) {
      try {
        this.outputNode.disconnect();
      } catch { /* suppress */ }
      this.outputNode = null;
    }
    this.audioCtx = null;
  }
}
