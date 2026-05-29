import { DSPEngine } from "./dsp-engine";
import { PluginInstance } from "../plugins/plugin-types";

export interface TrackNodes {
  pannerNode: StereoPannerNode;
  
  // 1. Filter
  filterNode: BiquadFilterNode;

  // Peak EQ
  eqLowNode: BiquadFilterNode;
  eqMidNode: BiquadFilterNode;
  eqHighNode: BiquadFilterNode;

  // 2. Saturation
  distortionDriveGain: GainNode;
  distortionNode: WaveShaperNode;
  distortionWetGain: GainNode;
  distortionDryGain: GainNode;

  // 3. Chorus
  chorusDelayNode: DelayNode;
  chorusLFO: OscillatorNode;
  chorusLFOGain: GainNode;
  chorusWetGain: GainNode;
  chorusDryGain: GainNode;

  // 4. Stereo Tape Delay
  delayNode: DelayNode;
  feedbackGainNode: GainNode;
  delayGainNode: GainNode;
  delayDryGain: GainNode;

  // 5. Professional Convolution Reverb
  reverbNode: ConvolverNode;
  reverbDecay: number;
  reverbWetGain: GainNode;
  reverbDryGain: GainNode;

  // 6. Compressor / Limiter
  compressorNode: DynamicsCompressorNode;

  // Fader output
  gainNode: GainNode;

  // Dynamic DSP custom inserts loaded by user
  dynamicPlugins?: {
    id: string;
    input: AudioNode;
    output: AudioNode;
    update: (now: number) => void;
  }[];
}

interface PluginHostInterface {
  createAudioGraphForPlugin: (
    ctx: AudioContext,
    plugin: PluginInstance,
    trackId?: string
  ) => {
    input: AudioNode;
    output: AudioNode;
    update: (now: number) => void;
  };
}

/**
 * Mixer Engine Sub-module.
 * Orchestrates multi-channel track nodes, master faders, and the cascading insert FX structures.
 */
export class MixerEngine {
  public trackNodes = new Map<string, TrackNodes>();

  /**
   * Safe termination of specific tracks to prevent memory and channel leaks on deletions.
   */
  removeTrack(trackId: string) {
    const nodes = this.trackNodes.get(trackId);
    if (nodes) {
      try {
        if (nodes.chorusLFO) {
          nodes.chorusLFO.disconnect();
          nodes.chorusLFO.stop();
        }
      } catch { /* ignorestopped oscillator */ }
      try {
        nodes.gainNode.disconnect();
      } catch { /* ignore */ }
      this.trackNodes.delete(trackId);
    }
  }

  /**
   * Initializes a set of Web Audio DSP configurations for a single mixer channel stripe.
   */
  ensureTrackNodes(audioCtx: AudioContext, masterGain: GainNode, trackId: string, track: { filterType?: string; filterCutoff?: number; filterReso?: number; distortionDrive?: number; chorusRate?: number; chorusDepth?: number; delayTime?: number; delayFeedback?: number; reverbDecay?: number }): TrackNodes {
    let nodes = this.trackNodes.get(trackId);
    if (!nodes) {
      // Create components
      const pannerNode = audioCtx.createStereoPanner();

      const filterNode = audioCtx.createBiquadFilter();
      filterNode.type = (track.filterType as BiquadFilterType) || "lowpass";
      filterNode.frequency.value = track.filterCutoff !== undefined ? track.filterCutoff : 20000;
      filterNode.Q.value = track.filterReso !== undefined ? track.filterReso : 1.0;

      const eqLowNode = audioCtx.createBiquadFilter();
      eqLowNode.type = "lowshelf";
      eqLowNode.frequency.value = 320;

      const eqMidNode = audioCtx.createBiquadFilter();
      eqMidNode.type = "peaking";
      eqMidNode.frequency.value = 1000;
      eqMidNode.Q.value = 1.0;

      const eqHighNode = audioCtx.createBiquadFilter();
      eqHighNode.type = "highshelf";
      eqHighNode.frequency.value = 3200;

      const distortionDriveGain = audioCtx.createGain();
      const distortionNode = audioCtx.createWaveShaper();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      distortionNode.curve = DSPEngine.makeDistortionCurve(track.distortionDrive || 0) as any;
      distortionNode.oversample = "4x";
      const distortionWetGain = audioCtx.createGain();
      const distortionDryGain = audioCtx.createGain();
      const chorusInputGain = audioCtx.createGain();

      const chorusDelayNode = audioCtx.createDelay(0.1);
      chorusDelayNode.delayTime.value = 0.02; // 20ms base delay
      const chorusLFO = audioCtx.createOscillator();
      chorusLFO.type = "sine";
      chorusLFO.frequency.value = track.chorusRate !== undefined ? track.chorusRate : 1.0;
      const chorusLFOGain = audioCtx.createGain();
      chorusLFOGain.gain.value = (track.chorusDepth !== undefined ? track.chorusDepth : 0) * 0.004;
      const chorusWetGain = audioCtx.createGain();
      const chorusDryGain = audioCtx.createGain();
      const delayInputGain = audioCtx.createGain();

      const delayNode = audioCtx.createDelay(2.0);
      delayNode.delayTime.value = track.delayTime !== undefined ? track.delayTime : 0.25;
      const feedbackGainNode = audioCtx.createGain();
      feedbackGainNode.gain.value = track.delayFeedback !== undefined ? track.delayFeedback : 0.35;
      const delayGainNode = audioCtx.createGain();
      const delayDryGain = audioCtx.createGain();
      const reverbInputGain = audioCtx.createGain();

      const reverbNode = audioCtx.createConvolver();
      const reverbDecayValue = track.reverbDecay !== undefined ? track.reverbDecay : 2.0;
      reverbNode.buffer = DSPEngine.createReverbImpulseResponse(audioCtx, reverbDecayValue);
      const reverbWetGain = audioCtx.createGain();
      const reverbDryGain = audioCtx.createGain();
      const compressorInputGain = audioCtx.createGain();

      const compressorNode = audioCtx.createDynamicsCompressor();

      const gainNode = audioCtx.createGain();

      // Interconnect nodes in series and parallel FX chains
      pannerNode.connect(filterNode);
      filterNode.connect(eqLowNode);
      eqLowNode.connect(eqMidNode);
      eqMidNode.connect(eqHighNode);

      // Saturator Routing splits
      eqHighNode.connect(distortionDriveGain);
      distortionDriveGain.connect(distortionNode);
      distortionNode.connect(distortionWetGain);
      eqHighNode.connect(distortionDryGain);
      
      distortionWetGain.connect(chorusInputGain);
      distortionDryGain.connect(chorusInputGain);

      // Chorus Routing splits
      chorusInputGain.connect(chorusDelayNode);
      chorusDelayNode.connect(chorusWetGain);
      chorusInputGain.connect(chorusDryGain);

      chorusLFO.connect(chorusLFOGain);
      chorusLFOGain.connect(chorusDelayNode.delayTime);
      chorusLFO.start(0);

      chorusWetGain.connect(delayInputGain);
      chorusDryGain.connect(delayInputGain);

      // Delay feedback splits
      delayInputGain.connect(delayNode);
      delayNode.connect(feedbackGainNode);
      feedbackGainNode.connect(delayNode);

      delayNode.connect(delayGainNode);
      delayInputGain.connect(delayDryGain);

      delayGainNode.connect(reverbInputGain);
      delayDryGain.connect(reverbInputGain);

      // Convolution Reverb splits
      reverbInputGain.connect(reverbNode);
      reverbNode.connect(reverbWetGain);
      reverbInputGain.connect(reverbDryGain);

      reverbWetGain.connect(compressorInputGain);
      reverbDryGain.connect(compressorInputGain);

      compressorInputGain.connect(compressorNode);
      compressorNode.connect(gainNode);
      gainNode.connect(masterGain);

      nodes = {
        pannerNode,
        filterNode,
        eqLowNode,
        eqMidNode,
        eqHighNode,
        distortionDriveGain,
        distortionNode,
        distortionWetGain,
        distortionDryGain,
        chorusDelayNode,
        chorusLFO,
        chorusLFOGain,
        chorusWetGain,
        chorusDryGain,
        delayNode,
        feedbackGainNode,
        delayGainNode,
        delayDryGain,
        reverbNode,
        reverbDecay: reverbDecayValue,
        reverbWetGain,
        reverbDryGain,
        compressorNode,
        gainNode
      };
      this.trackNodes.set(trackId, nodes);
    }
    return nodes;
  }

  /**
   * Integrates user parameter selections onto the Web Audio Nodes smoothly.
   */
  updateTrackParameters(audioCtx: AudioContext, trackId: string, track: { volume: number; pan?: number; mute?: boolean; solo?: boolean; filterType?: string; filterCutoff?: number; filterReso?: number; eqLow?: number; eqMid?: number; eqHigh?: number; distortionDrive?: number; distortionMix?: number; chorusRate?: number; chorusDepth?: number; chorusMix?: number; delayTime?: number; delayFeedback?: number; delayMix?: number; reverbDecay?: number; reverbMix?: number; compThreshold?: number; compRatio?: number }, anySolo: boolean) {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;

    const nowTime = audioCtx.currentTime;

    // Filters
    const fType = (track.filterType as BiquadFilterType) || "lowpass";
    if (nodes.filterNode.type !== fType) {
      nodes.filterNode.type = fType;
    }
    const cutoffVal = track.filterCutoff !== undefined ? track.filterCutoff : 20000;
    nodes.filterNode.frequency.setTargetAtTime(cutoffVal, nowTime, 0.05);
    const resoVal = track.filterReso !== undefined ? track.filterReso : 1.0;
    nodes.filterNode.Q.setTargetAtTime(resoVal, nowTime, 0.05);

    // EQs
    nodes.eqLowNode.gain.setTargetAtTime(track.eqLow || 0, nowTime, 0.05);
    nodes.eqMidNode.gain.setTargetAtTime(track.eqMid || 0, nowTime, 0.05);
    nodes.eqHighNode.gain.setTargetAtTime(track.eqHigh || 0, nowTime, 0.05);

    // Tube Saturator
    const driveVal = track.distortionDrive !== undefined ? track.distortionDrive : 0;
    const distMixVal = track.distortionMix !== undefined ? track.distortionMix : 0;
    nodes.distortionDriveGain.gain.setTargetAtTime(1.0 + driveVal * 0.15, nowTime, 0.05);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes.distortionNode.curve = DSPEngine.makeDistortionCurve(driveVal) as any;
    nodes.distortionWetGain.gain.setTargetAtTime(distMixVal, nowTime, 0.05);
    nodes.distortionDryGain.gain.setTargetAtTime(1.0 - distMixVal, nowTime, 0.05);

    // Chorus
    const chorusRateVal = track.chorusRate !== undefined ? track.chorusRate : 1.0;
    const chorusDepthVal = track.chorusDepth !== undefined ? track.chorusDepth : 0;
    const chorusMixVal = track.chorusMix !== undefined ? track.chorusMix : 0;
    nodes.chorusLFO.frequency.setTargetAtTime(chorusRateVal, nowTime, 0.05);
    nodes.chorusLFOGain.gain.setTargetAtTime(chorusDepthVal * 0.004, nowTime, 0.05);
    nodes.chorusWetGain.gain.setTargetAtTime(chorusMixVal, nowTime, 0.05);
    nodes.chorusDryGain.gain.setTargetAtTime(1.0 - chorusMixVal, nowTime, 0.05);

    // Delay Echo
    const delayTimeVal = track.delayTime !== undefined ? track.delayTime : 0.25;
    const delayFbackVal = track.delayFeedback !== undefined ? track.delayFeedback : 0.35;
    const delayMixVal = track.delayMix !== undefined ? track.delayMix : 0;
    nodes.delayNode.delayTime.setTargetAtTime(delayTimeVal, nowTime, 0.05);
    nodes.feedbackGainNode.gain.setTargetAtTime(Math.min(0.95, delayFbackVal), nowTime, 0.05);
    nodes.delayGainNode.gain.setTargetAtTime(delayMixVal, nowTime, 0.05);
    nodes.delayDryGain.gain.setTargetAtTime(1.0 - delayMixVal, nowTime, 0.05);

    // Convolver Reverb
    const reverbDecayVal = track.reverbDecay !== undefined ? track.reverbDecay : 2.0;
    const reverbMixVal = track.reverbMix !== undefined ? track.reverbMix : 0;
    if (nodes.reverbDecay !== reverbDecayVal) {
      nodes.reverbDecay = reverbDecayVal;
      try {
        nodes.reverbNode.buffer = DSPEngine.createReverbImpulseResponse(audioCtx, reverbDecayVal);
      } catch (e) {
        console.warn("Unable to generate/apply convolver reverb buffer in MixerEngine:", e);
      }
    }
    nodes.reverbWetGain.gain.setTargetAtTime(reverbMixVal, nowTime, 0.05);
    nodes.reverbDryGain.gain.setTargetAtTime(1.0 - reverbMixVal, nowTime, 0.05);

    // Dynamics Compressor
    nodes.compressorNode.threshold.setTargetAtTime(track.compThreshold !== undefined ? track.compThreshold : -18, nowTime, 0.05);
    nodes.compressorNode.ratio.setTargetAtTime(track.compRatio !== undefined ? track.compRatio : 4, nowTime, 0.05);

    // Update dynamic plugins
    if (nodes.dynamicPlugins) {
      for (const dp of nodes.dynamicPlugins) {
        try {
          dp.update(nowTime);
        } catch (e) {
          console.warn("Plugin dynamic parameter update failed inside MixerEngine:", e);
        }
      }
    }

    // Mixer Fader Levels
    const isMuted = track.mute || (anySolo && !track.solo);
    nodes.gainNode.gain.setTargetAtTime(isMuted ? 0 : track.volume, nowTime, 0.05);
    nodes.pannerNode.pan.setTargetAtTime(track.pan || 0, nowTime, 0.05);
  }

  /**
   * Cascades active plug FX loops in series using the plugin host interfaces.
   */
  rebuildDynamicPluginsChain(
    audioCtx: AudioContext,
    trackId: string,
    list: PluginInstance[],
    pluginHostService: PluginHostInterface
  ) {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes) return;
    const currentList = nodes.dynamicPlugins || [];

    const listSignature = list.map(p => p.id + "_" + p.bypass).join(",");
    const currentSignature = currentList.map(p => p.id + "_" + (p.output ? "active" : "bypassed")).join(",");

    if (listSignature !== currentSignature || !nodes.dynamicPlugins) {
      try {
        nodes.compressorNode.disconnect();
      } catch { /* ignore validation cycle */ }

      if (nodes.dynamicPlugins) {
        for (const p of nodes.dynamicPlugins) {
          try {
            p.output.disconnect();
          } catch { /* ignore */ }
        }
      }

      const newDps: { id: string; input: AudioNode; output: AudioNode; update: (now: number) => void }[] = [];
      let lastNode: AudioNode = nodes.compressorNode;

      for (const p of list) {
        const graph = pluginHostService.createAudioGraphForPlugin(audioCtx, p, trackId);
        lastNode.connect(graph.input);
        lastNode = graph.output;

        newDps.push({
          id: p.id,
          input: graph.input,
          output: graph.output,
          update: graph.update
        });
      }

      lastNode.connect(nodes.gainNode);
      nodes.dynamicPlugins = newDps;
    }
  }

  /**
   * Reset the whole track routing grid to prevent lingering memory buffers.
   */
  reset() {
    for (const [id] of this.trackNodes.entries()) {
      this.removeTrack(id);
    }
    this.trackNodes.clear();
  }
}
