import { Injectable, effect, inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ProjectService, Track, Clip } from "./project.service";
import { WorkspaceService } from "./workspace.service";
import { MidiSchedulerService } from "./midi/midi-scheduler.service";
import { PluginHostService } from "./plugins/plugin-host.service";

interface TrackNodes {
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

@Injectable({ providedIn: "root" })
export class AudioEngineService {
  private audioCtx: AudioContext | null = null;
  private masterGain!: GainNode;

  // Active custom Synth parameter controls
  synthCutoff = 1500;
  synthResonance = 2.0;
  synthAttack = 0.05;
  synthRelease = 0.4;
  synthWaveType: OscillatorType = "sawtooth";
  synthOctave = 0;

  customAssetUrlMap = new Map<string, string>();

  updateSynthParams(params: {
    cutoff?: number;
    resonance?: number;
    attack?: number;
    release?: number;
    waveType?: OscillatorType;
    octave?: number;
  }) {
    if (params.cutoff !== undefined) this.synthCutoff = params.cutoff;
    if (params.resonance !== undefined) this.synthResonance = params.resonance;
    if (params.attack !== undefined) this.synthAttack = params.attack;
    if (params.release !== undefined) this.synthRelease = params.release;
    if (params.waveType !== undefined) this.synthWaveType = params.waveType;
    if (params.octave !== undefined) this.synthOctave = params.octave;
  }

  private clockWorker: Worker | null = null;
  private lastTime = 0;
  private trackNodes = new Map<string, TrackNodes>();
  private sampleCache = new Map<string, AudioBuffer>();
  private isLoading = new Map<string, boolean>();
  private nextEventTime = 0;
  private currentEighthNote = 0;
  private lastSetPlayhead = 0;

  private platformId = inject(PLATFORM_ID);
  private projectService = inject(ProjectService);
  private workspace = inject(WorkspaceService);
  private midiScheduler = inject(MidiSchedulerService);
  private pluginHost = inject(PluginHostService);

  constructor() {
    effect(() => {
      const isPlaying = this.projectService.isPlaying();
      if (isPlaying) {
        this.start();
      } else {
        this.pause();
      }
    });

    // React to track volume/mute/plugin changes
    effect(() => {
      const tracks = this.projectService.tracks();
      this.pluginHost.trackFxChains(); // read the signal directly to register dependency tracking reactively
      if (this.audioCtx) {
        this.updateRouting(tracks);
      }
    });
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // Formula for soft-clipping tube distortion curve
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  private createReverbImpulseResponse(decay: number): AudioBuffer {
    const rate = this.audioCtx ? this.audioCtx.sampleRate : 44100;
    const length = rate * Math.max(0.1, decay);
    const impulse = this.audioCtx 
      ? this.audioCtx.createBuffer(2, length, rate) 
      : { getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
    
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const percent = i / length;
      // Exponential envelope decay representing studio room absorption kinetics
      const decayFactor = Math.exp(-9 * percent);
      left[i] = (Math.random() * 2 - 1) * decayFactor * 0.5;
      right[i] = (Math.random() * 2 - 1) * decayFactor * 0.5;
    }
    return impulse;
  }

  private initContext() {
    if (!this.audioCtx && isPlatformBrowser(this.platformId)) {
      try {
        const AudioCtx =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.connect(this.audioCtx.destination);
          this.masterGain.gain.value = 0.5; // Master volume
        }
      } catch (e) {
        console.warn("AudioContext initialization failed", e);
      }
    }
  }

  private updateRouting(tracks: Track[]) {
    if (!this.audioCtx) return;

    // Remove deleted tracks and clean up LFO oscillators
    for (const [id, nodes] of this.trackNodes.entries()) {
      if (!tracks.find((t) => t.id === id)) {
        try {
          if (nodes.chorusLFO) {
            nodes.chorusLFO.disconnect();
            nodes.chorusLFO.stop();
          }
        } catch {
          // ignore stopped oscillator errors
        }
        nodes.gainNode.disconnect();
        this.trackNodes.delete(id);
      }
    }

    const anySolo = tracks.some((t) => t.solo);

    for (const track of tracks) {
      let nodes = this.trackNodes.get(track.id);
      if (!nodes) {
        // --- 1. Instantiate DSP Audio Nodes ---
        const pannerNode = this.audioCtx.createStereoPanner();

        // Stage 1 Filter node
        const filterNode = this.audioCtx.createBiquadFilter();
        filterNode.type = track.filterType || "lowpass";
        filterNode.frequency.value = track.filterCutoff !== undefined ? track.filterCutoff : 20000;
        filterNode.Q.value = track.filterReso !== undefined ? track.filterReso : 1.0;

        // Vintage parametric EQ Shelf and Peak filters
        const eqLowNode = this.audioCtx.createBiquadFilter();
        eqLowNode.type = "lowshelf";
        eqLowNode.frequency.value = 320;

        const eqMidNode = this.audioCtx.createBiquadFilter();
        eqMidNode.type = "peaking";
        eqMidNode.frequency.value = 1000;
        eqMidNode.Q.value = 1.0;

        const eqHighNode = this.audioCtx.createBiquadFilter();
        eqHighNode.type = "highshelf";
        eqHighNode.frequency.value = 3200;

        // Stage 2: Vintage Tube Saturator
        const distortionDriveGain = this.audioCtx.createGain();
        const distortionNode = this.audioCtx.createWaveShaper();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        distortionNode.curve = this.makeDistortionCurve(track.distortionDrive || 0) as any;
        distortionNode.oversample = "4x";
        const distortionWetGain = this.audioCtx.createGain();
        const distortionDryGain = this.audioCtx.createGain();
        const chorusInputGain = this.audioCtx.createGain();

        // Stage 3: Analog Chorus/Flanger
        const chorusDelayNode = this.audioCtx.createDelay(0.1);
        chorusDelayNode.delayTime.value = 0.02; // 20ms base delay
        const chorusLFO = this.audioCtx.createOscillator();
        chorusLFO.type = "sine";
        chorusLFO.frequency.value = track.chorusRate !== undefined ? track.chorusRate : 1.0;
        const chorusLFOGain = this.audioCtx.createGain();
        chorusLFOGain.gain.value = (track.chorusDepth !== undefined ? track.chorusDepth : 0) * 0.004;
        const chorusWetGain = this.audioCtx.createGain();
        const chorusDryGain = this.audioCtx.createGain();
        const delayInputGain = this.audioCtx.createGain();

        // Stage 4: Tape Delay
        const delayNode = this.audioCtx.createDelay(2.0);
        delayNode.delayTime.value = track.delayTime !== undefined ? track.delayTime : 0.25;
        const feedbackGainNode = this.audioCtx.createGain();
        feedbackGainNode.gain.value = track.delayFeedback !== undefined ? track.delayFeedback : 0.35;
        const delayGainNode = this.audioCtx.createGain();
        const delayDryGain = this.audioCtx.createGain();
        const reverbInputGain = this.audioCtx.createGain();

        // Stage 5: Pro Studio Reverb (Convolution)
        const reverbNode = this.audioCtx.createConvolver();
        const reverbDecayValue = track.reverbDecay !== undefined ? track.reverbDecay : 2.0;
        reverbNode.buffer = this.createReverbImpulseResponse(reverbDecayValue);
        const reverbWetGain = this.audioCtx.createGain();
        const reverbDryGain = this.audioCtx.createGain();
        const compressorInputGain = this.audioCtx.createGain();

        // Stage 6: Studio Mastering Compressor/Limiter
        const compressorNode = this.audioCtx.createDynamicsCompressor();

        // Final Mix Track Fader
        const gainNode = this.audioCtx.createGain();

        // --- 2. Interconnect DSP Graph in Series/Parallel Nodes ---
        // Input -> Panner -> state-variable filter -> Parametric High/Mid/Low EQ rack
        pannerNode.connect(filterNode);
        filterNode.connect(eqLowNode);
        eqLowNode.connect(eqMidNode);
        eqMidNode.connect(eqHighNode);

        // Saturation Tube section split
        eqHighNode.connect(distortionDriveGain);
        distortionDriveGain.connect(distortionNode);
        distortionNode.connect(distortionWetGain);
        eqHighNode.connect(distortionDryGain);
        
        // Saturation merger
        distortionWetGain.connect(chorusInputGain);
        distortionDryGain.connect(chorusInputGain);

        // Chorus modulation section split
        chorusInputGain.connect(chorusDelayNode);
        chorusDelayNode.connect(chorusWetGain);
        chorusInputGain.connect(chorusDryGain);

        // LFO Pitch Shimmer wiring
        chorusLFO.connect(chorusLFOGain);
        chorusLFOGain.connect(chorusDelayNode.delayTime);
        chorusLFO.start(0);

        // Chorus merger
        chorusWetGain.connect(delayInputGain);
        chorusDryGain.connect(delayInputGain);

        // Delay echo feedback circuit split
        delayInputGain.connect(delayNode);
        delayNode.connect(feedbackGainNode);
        feedbackGainNode.connect(delayNode); // feedback routing

        delayNode.connect(delayGainNode);
        delayInputGain.connect(delayDryGain);

        // Delay merger
        delayGainNode.connect(reverbInputGain);
        delayDryGain.connect(reverbInputGain);

        // Convolution Reverb section split
        reverbInputGain.connect(reverbNode);
        reverbNode.connect(reverbWetGain);
        reverbInputGain.connect(reverbDryGain);

        // Reverb merger
        reverbWetGain.connect(compressorInputGain);
        reverbDryGain.connect(compressorInputGain);

        // Compressor -> Master sum
        compressorInputGain.connect(compressorNode);
        compressorNode.connect(gainNode);
        gainNode.connect(this.masterGain);

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
        this.trackNodes.set(track.id, nodes);
      }

      this.rebuildDynamicPluginsChain(track, nodes);

      const nowTime = this.audioCtx.currentTime;

      // --- 3. Run Real-time Parameter Interpolations ---
      // Filter updates
      const fType = track.filterType || "lowpass";
      if (nodes.filterNode.type !== fType) {
        nodes.filterNode.type = fType;
      }
      const cutoffVal = track.filterCutoff !== undefined ? track.filterCutoff : 20000;
      nodes.filterNode.frequency.setTargetAtTime(cutoffVal, nowTime, 0.05);
      const resoVal = track.filterReso !== undefined ? track.filterReso : 1.0;
      nodes.filterNode.Q.setTargetAtTime(resoVal, nowTime, 0.05);

      // Vintage EQs
      nodes.eqLowNode.gain.setTargetAtTime(track.eqLow || 0, nowTime, 0.05);
      nodes.eqMidNode.gain.setTargetAtTime(track.eqMid || 0, nowTime, 0.05);
      nodes.eqHighNode.gain.setTargetAtTime(track.eqHigh || 0, nowTime, 0.05);

      // Tube Saturator (Drive & Wet/Dry Mix)
      const driveVal = track.distortionDrive !== undefined ? track.distortionDrive : 0;
      const distMixVal = track.distortionMix !== undefined ? track.distortionMix : 0;
      nodes.distortionDriveGain.gain.setTargetAtTime(1.0 + driveVal * 0.15, nowTime, 0.05);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodes.distortionNode.curve = this.makeDistortionCurve(driveVal) as any;
      nodes.distortionWetGain.gain.setTargetAtTime(distMixVal, nowTime, 0.05);
      nodes.distortionDryGain.gain.setTargetAtTime(1.0 - distMixVal, nowTime, 0.05);

      // Chorus (Rate, Depth, and Wet/Dry Mix)
      const chorusRateVal = track.chorusRate !== undefined ? track.chorusRate : 1.0;
      const chorusDepthVal = track.chorusDepth !== undefined ? track.chorusDepth : 0;
      const chorusMixVal = track.chorusMix !== undefined ? track.chorusMix : 0;
      nodes.chorusLFO.frequency.setTargetAtTime(chorusRateVal, nowTime, 0.05);
      nodes.chorusLFOGain.gain.setTargetAtTime(chorusDepthVal * 0.004, nowTime, 0.05);
      nodes.chorusWetGain.gain.setTargetAtTime(chorusMixVal, nowTime, 0.05);
      nodes.chorusDryGain.gain.setTargetAtTime(1.0 - chorusMixVal, nowTime, 0.05);

      // Tape Echo Delay (Delay Time, Feedback, and Mix)
      const delayTimeVal = track.delayTime !== undefined ? track.delayTime : 0.25;
      const delayFbackVal = track.delayFeedback !== undefined ? track.delayFeedback : 0.35;
      const delayMixVal = track.delayMix !== undefined ? track.delayMix : 0;
      nodes.delayNode.delayTime.setTargetAtTime(delayTimeVal, nowTime, 0.05);
      nodes.feedbackGainNode.gain.setTargetAtTime(Math.min(0.95, delayFbackVal), nowTime, 0.05);
      nodes.delayGainNode.gain.setTargetAtTime(delayMixVal, nowTime, 0.05);
      nodes.delayDryGain.gain.setTargetAtTime(1.0 - delayMixVal, nowTime, 0.05);

      // Pro Studio Convolution Reverb
      const reverbDecayVal = track.reverbDecay !== undefined ? track.reverbDecay : 2.0;
      const reverbMixVal = track.reverbMix !== undefined ? track.reverbMix : 0;
      if (nodes.reverbDecay !== reverbDecayVal) {
        nodes.reverbDecay = reverbDecayVal;
        try {
          nodes.reverbNode.buffer = this.createReverbImpulseResponse(reverbDecayVal);
        } catch (e) {
          console.warn("Unable to generate/apply convolver reverb buffer", e);
        }
      }
      nodes.reverbWetGain.gain.setTargetAtTime(reverbMixVal, nowTime, 0.05);
      nodes.reverbDryGain.gain.setTargetAtTime(1.0 - reverbMixVal, nowTime, 0.05);

      // Compressor Threshold & Ratio
      nodes.compressorNode.threshold.setTargetAtTime(track.compThreshold !== undefined ? track.compThreshold : -18, nowTime, 0.05);
      nodes.compressorNode.ratio.setTargetAtTime(track.compRatio !== undefined ? track.compRatio : 4, nowTime, 0.05);

      // Interpolate user loaded dynamic custom DSP modules
      if (nodes.dynamicPlugins) {
        for (const dp of nodes.dynamicPlugins) {
          try {
            dp.update(nowTime);
          } catch (e) {
            console.warn("Plugin dynamic parameter update failed:", e);
          }
        }
      }

      // Main Mixer Volume & Channel Panning
      const isMuted = track.mute || (anySolo && !track.solo);
      nodes.gainNode.gain.setTargetAtTime(
        isMuted ? 0 : track.volume,
        this.audioCtx.currentTime,
        0.05,
      );
      nodes.pannerNode.pan.setTargetAtTime(
        track.pan || 0,
        this.audioCtx.currentTime,
        0.05,
      );
    }
  }

  private rebuildDynamicPluginsChain(track: Track, nodes: TrackNodes) {
    if (!this.audioCtx) return;
    const list = this.pluginHost.trackFxChains().get(track.id)?.plugins || [];
    const currentList = nodes.dynamicPlugins || [];

    // Compare signature (including bypass states) to see if chain structure has evolved
    const listSignature = list.map(p => p.id + "_" + p.bypass).join(",");
    const currentSignature = currentList.map(p => p.id + "_" + (p.output ? "active" : "bypassed")).join(",");

    if (listSignature !== currentSignature || !nodes.dynamicPlugins) {
      // 1. Terminate compressorNode and other dynamic outputs connections safe cycle
      try {
        nodes.compressorNode.disconnect();
      } catch { /* ignore */ }

      if (nodes.dynamicPlugins) {
        for (const p of nodes.dynamicPlugins) {
          try {
            p.output.disconnect();
          } catch { /* ignore */ }
        }
      }

      // 2. Wire up the cascading pipeline
      const newDps: { id: string; input: AudioNode; output: AudioNode; update: (now: number) => void }[] = [];
      let lastNode: AudioNode = nodes.compressorNode;

      for (const p of list) {
        const graph = this.pluginHost.createAudioGraphForPlugin(this.audioCtx, p, track.id);
        
        // Connect previous stage output to current plugin input
        lastNode.connect(graph.input);
        lastNode = graph.output;

        newDps.push({
          id: p.id,
          input: graph.input,
          output: graph.output,
          update: graph.update
        });
      }

      // 3. Connect final element to output gain node
      lastNode.connect(nodes.gainNode);
      nodes.dynamicPlugins = newDps;
    }
  }

  private start() {
    this.initContext();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    if (!this.audioCtx) return; // if initContext failed (e.g. SSR)

    const playheadBeats = this.projectService.playheadPosition();
    this.currentEighthNote = Math.floor(playheadBeats * 4);
    this.lastSetPlayhead = playheadBeats;
    // Restart lookahead slightly ahead of context
    this.nextEventTime = this.audioCtx.currentTime + 0.1;

    this.lastTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    if (!this.clockWorker) {
      const code = `
        let timer = null;
        self.onmessage = (e) => {
          if (e.data === 'start') {
            if (!timer) timer = setInterval(() => self.postMessage('tick'), 16);
          } else if (e.data === 'stop') {
            clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([code], { type: 'application/javascript' });
      this.clockWorker = new Worker(URL.createObjectURL(blob));
      this.clockWorker.onmessage = () => {
        this.tick(typeof performance !== "undefined" ? performance.now() : Date.now());
      };
    }
    
    this.clockWorker.postMessage('start');
    this.tick(this.lastTime);
  }

  private pause() {
    if (this.clockWorker) {
      this.clockWorker.postMessage('stop');
    }
  }

  private tick(now: number) {
    if (!this.audioCtx || !this.projectService.isPlaying()) return;

    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    const bpm = this.projectService.bpm();
    const beatsPerSecond = bpm / 60;
    const deltaBeats = (deltaMs / 1000) * beatsPerSecond;

    // Detect external seek
    const currentPos = this.projectService.playheadPosition();
    const expectedPos = this.lastSetPlayhead;
    if (Math.abs(currentPos - expectedPos) > 0.05) {
      // User seeked the playhead from the UI
      this.currentEighthNote = Math.floor(currentPos * 4);
      this.nextEventTime = this.audioCtx.currentTime + 0.1;
    }

    // Update playhead
    let nextPos = currentPos + deltaBeats;
    const isLooping = this.projectService.loopEnabled();
    const loopStartValue = this.projectService.loopStart();
    const loopEndValue = this.projectService.loopEnd();

    if (isLooping && nextPos >= loopEndValue) {
      nextPos = loopStartValue + (nextPos % Math.max(0.1, loopEndValue - loopStartValue));
      this.currentEighthNote = Math.floor(nextPos * 4);
    }
    this.projectService.playheadPosition.set(nextPos);
    this.lastSetPlayhead = nextPos;

    // Schedule audio
    const secondsPerBeat = 60.0 / bpm;
    // Lookahead approach for scheduling
    while (this.nextEventTime < this.audioCtx.currentTime + 0.1) {
      this.scheduleNote(this.currentEighthNote, this.nextEventTime);

      // Update UI step
      const stepIndex = this.currentEighthNote % 16;
      this.projectService.currentStep.set(stepIndex);

      this.nextEventTime += 0.25 * secondsPerBeat; // Sixteenth note step instead of eighth
      this.currentEighthNote++;
      
      if (isLooping) {
        const loopEnd16ths = Math.floor(loopEndValue * 4);
        const loopStart16ths = Math.floor(loopStartValue * 4);
        if (this.currentEighthNote >= loopEnd16ths) {
           this.currentEighthNote = loopStart16ths;
        }
      }
    }
  }

  playOneShot(
    instrument: string,
    url?: string,
    options?: { pitch?: number; start?: number; end?: number; fade?: number }
  ) {
    if (!this.audioCtx) this.initContext();
    if (!this.audioCtx) return; // Init failed
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();

    const time = this.audioCtx.currentTime;
    let out: AudioNode = this.masterGain;

    const name = instrument.toLowerCase();
    const isNote = /^[A-G]#?[0-9]$/i.test(instrument);

    let targetTrackId = "";
    if (["kick", "snare", "hihat", "clap", "crash", "rim", "perc 1", "perc 2", "open hat", "shaker"].some(t => name.includes(t))) {
      targetTrackId = "t1"; // Drums
    } else if (name.includes("bass")) {
      targetTrackId = "t2"; // Bass
    } else if (name.includes("pad") || isNote || name.includes("keys")) {
      targetTrackId = "t3"; // Keys
    } else if (name.includes("lead") || name.includes("synth")) {
      targetTrackId = "t4"; // Lead
    } else if (name.includes("vocal") || name.includes("sfx")) {
      targetTrackId = "t5"; // Vocals
    }

    if (targetTrackId) {
      const nodes = this.trackNodes.get(targetTrackId);
      if (nodes) {
        out = nodes.pannerNode;
      }
    }

    if (url) {
      this.playUrl(url, out, time, options);
      return;
    }

    if (isNote) {
      const midi = this.noteToMidi(instrument);
      const SALAMANDER_NOTES = [
        { name: "A0", midi: 21 }, { name: "C1", midi: 24 }, { name: "D#1", midi: 27 }, { name: "F#1", midi: 30 },
        { name: "A1", midi: 33 }, { name: "C2", midi: 36 }, { name: "D#2", midi: 39 }, { name: "F#2", midi: 42 },
        { name: "A2", midi: 45 }, { name: "C3", midi: 48 }, { name: "D#3", midi: 51 }, { name: "F#3", midi: 54 },
        { name: "A3", midi: 57 }, { name: "C4", midi: 60 }, { name: "D#4", midi: 63 }, { name: "F#4", midi: 66 },
        { name: "A4", midi: 69 }, { name: "C5", midi: 72 }, { name: "D#5", midi: 75 }, { name: "F#5", midi: 78 },
        { name: "A5", midi: 81 }, { name: "C6", midi: 84 }, { name: "D#6", midi: 87 }, { name: "F#6", midi: 90 },
        { name: "A6", midi: 93 }, { name: "C7", midi: 96 }, { name: "D#7", midi: 99 }, { name: "F#7", midi: 102 },
        { name: "A7", midi: 105 }, { name: "C8", midi: 108 }
      ];
      
      let closest = SALAMANDER_NOTES[0];
      let minDiff = Math.abs(midi - closest.midi);
      for (let i = 1; i < SALAMANDER_NOTES.length; i++) {
        const diff = Math.abs(midi - SALAMANDER_NOTES[i].midi);
        if (diff < minDiff) {
          minDiff = diff;
          closest = SALAMANDER_NOTES[i];
        }
      }
      
      const noteUrl = `https://tonejs.github.io/audio/salamander/${encodeURIComponent(closest.name)}.mp3`;
      const semitoneDiff = midi - closest.midi;
      const pitchOctaves = semitoneDiff / 12;
      
      this.playUrl(noteUrl, out, time, { ...options, pitch: pitchOctaves });
      return;
    }

    const lowerName = instrument.toLowerCase();

    if (lowerName.includes("kick") || lowerName.includes("kck")) {
      this.playKick(time, out);
      return;
    }

    if (lowerName.includes("snare") || lowerName.includes("snr") || lowerName.includes("rim")) {
      this.playSnare(time, out);
      return;
    }

    if (lowerName.includes("clap") || lowerName.includes("clp")) {
      this.playClap(time, out);
      return;
    }

    if (
      lowerName.includes("hihat") ||
      lowerName.includes("hat") ||
      lowerName.includes("ht") ||
      lowerName.includes("cym") ||
      lowerName.includes("shaker") ||
      lowerName.includes("tamb") ||
      lowerName.includes("maraca") ||
      lowerName.includes("crash")
    ) {
      this.playHihat(time, out);
      return;
    }

    if (lowerName.includes("bass") || lowerName.includes("bas")) {
      const type: OscillatorType = lowerName.includes("acid") || lowerName.includes("psy") ? "sawtooth" : "sine";
      const freq = lowerName.includes("sub") ? 32.7 : 55.0; // low C1 or A1
      this.playSynth(time, freq, 0.4, type, out);
      return;
    }

    if (
      lowerName.includes("chord") ||
      lowerName.includes("chd") ||
      lowerName.includes("rhodes") ||
      lowerName.includes("epiano")
    ) {
      this.playSynth(time, 261.63, 0.2, "triangle", out); // C4
      this.playSynth(time, 311.13, 0.2, "triangle", out); // D#4
      this.playSynth(time, 392.00, 0.2, "triangle", out); // G4
      return;
    }

    if (
      lowerName.includes("synth") ||
      lowerName.includes("stb") ||
      lowerName.includes("beep") ||
      lowerName.includes("slinky")
    ) {
      const type: OscillatorType = lowerName.includes("rave") || lowerName.includes("square") ? "square" : "triangle";
      this.playSynth(time, 220, 0.3, type, out);
      return;
    }

    if (lowerName.includes("lead") || lowerName.includes("scream") || lowerName.includes("fl")) {
      this.playSynth(time, 659.25, 0.3, "sawtooth", out); // E5
      return;
    }

    if (
      lowerName.includes("pad") ||
      lowerName.includes("swell") ||
      lowerName.includes("shree") ||
      lowerName.includes("wave") ||
      lowerName.includes("wv")
    ) {
      this.playSynth(time, 196.00, 0.5, "sine", out); // G3
      return;
    }

    if (lowerName.includes("bell") || lowerName.includes("chime") || lowerName.includes("whistle")) {
      this.playSynth(time, 880, 0.2, "sine", out); // High pitch
      return;
    }

    if (
      lowerName.includes("metronome") ||
      lowerName.includes("clk") ||
      lowerName.includes("click") ||
      lowerName.includes("wood")
    ) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, time);
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 0.06);
      return;
    }

    if (
      lowerName.includes("drop") ||
      lowerName.includes("impact") ||
      lowerName.includes("fall") ||
      lowerName.includes("fx") ||
      lowerName.includes("roll") ||
      lowerName.includes("horn") ||
      lowerName.includes("siren") ||
      lowerName.includes("space")
    ) {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.6);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
      osc.connect(gain);
      gain.connect(out);
      osc.start(time);
      osc.stop(time + 0.6);
      return;
    }

    if (lowerName.includes("vocal") || lowerName.includes("shout") || lowerName.includes("ah")) {
      this.playSynth(time, 300, 0.25, "sine", out);
      return;
    }

    this.playSynth(time, 440, 0.1, "sine", out);
  }

  noteToFreq(note: string): number {
    const notesMap: Record<string, number> = {
      "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11
    };
    const match = note.match(/^([A-G]#?)([0-9])$/i);
    if (!match) return 440;
    const name = match[1].toUpperCase();
    const octave = parseInt(match[2], 10);
    const offset = notesMap[name] ?? 0;
    const midi = (octave + 1) * 12 + offset;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  noteToMidi(note: string): number {
    const notesMap: Record<string, number> = {
      "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11
    };
    const match = note.match(/^([A-G]#?)([0-9])$/i);
    if (!match) return 60;
    const name = match[1].toUpperCase();
    const octave = parseInt(match[2], 10);
    const offset = notesMap[name] ?? 0;
    return (octave + 1) * 12 + offset;
  }

  getAudioBuffer(originalUrl: string): Promise<AudioBuffer | null> {
    const url = this.cleanAudioUrl(originalUrl);
    if (!this.audioCtx) this.initContext();
    if (!this.audioCtx) return Promise.resolve(null);
    if (this.sampleCache.has(url)) {
      return Promise.resolve(this.sampleCache.get(url)!);
    }

    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => this.audioCtx!.decodeAudioData(data))
      .then((decodedBuf) => {
        this.sampleCache.set(url, decodedBuf);
        return decodedBuf;
      })
      .catch((err) => {
        console.error("Failed to load sample config", url, err);
        return null;
      });
  }

  private cleanAudioUrl(url: string): string {
    if (url.includes("salamander")) {
      const parts = url.split("/");
      const lastPart = parts[parts.length - 1];
      if (lastPart.includes("#") || lastPart.includes("%23")) {
        const replaced = lastPart.replace(/#|%23/g, "s");
        parts[parts.length - 1] = replaced;
        return parts.join("/");
      }
    }
    return url;
  }

  private playUrl(originalUrl: string, out: AudioNode, time: number, options?: { pitch?: number; start?: number; end?: number; fade?: number; startSeconds?: number; durationSeconds?: number; playbackRate?: number }) {
    if (!this.audioCtx) return;
    const url = this.cleanAudioUrl(originalUrl);
    const buffer = this.sampleCache.get(url);
    if (buffer) {
      this.playBuffer(buffer, out, time, options);
    } else {
      if (!this.isLoading.get(url)) {
        this.isLoading.set(url, true);
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            return res.arrayBuffer();
          })
          .then((data) => this.audioCtx!.decodeAudioData(data))
          .then((decodedBuf) => {
            this.sampleCache.set(url, decodedBuf);
            this.isLoading.set(url, false);
            // Play it once loaded since it was a playback request
            this.playBuffer(decodedBuf, out, this.audioCtx!.currentTime, options);
          })
          .catch((err) => {
            console.error("Failed to load sample", url, err);
            this.isLoading.set(url, false);
            // Dynamic Synth Fallback block
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes("kick")) this.playKick(time, out);
            else if (lowerUrl.includes("snare") || lowerUrl.includes("rim")) this.playSnare(time, out);
            else if (lowerUrl.includes("hihat") || lowerUrl.includes("hat") || lowerUrl.includes("shaker")) this.playHihat(time, out);
            else if (lowerUrl.includes("clap")) this.playClap(time, out);
            else {
              const matches = url.match(/([A-G]#?[0-9])/i);
              const freq = matches ? this.noteToFreq(matches[1]) : 440;
              this.playSynth(time, freq, 0.35, "sine", out);
            }
          });
      }
    }
  }

  private playBuffer(buffer: AudioBuffer, out: AudioNode, time: number, options?: { pitch?: number; start?: number; end?: number; fade?: number; startSeconds?: number; durationSeconds?: number; playbackRate?: number }) {
    if (!this.audioCtx) return;
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    
    if (options?.playbackRate !== undefined) {
      source.playbackRate.value = options.playbackRate;
    } else if (options?.pitch !== undefined) {
      source.playbackRate.value = Math.pow(2, options.pitch);
    }

    let pOut: AudioNode = out;

    if (options?.fade !== undefined && options.fade > 0) {
      const gainNode = this.audioCtx.createGain();
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(1, time + options.fade * buffer.duration * 0.5);
      gainNode.connect(out);
      pOut = gainNode;
    }

    source.connect(pOut);

    const startOffset = options?.startSeconds !== undefined ? options.startSeconds : (options?.start ? options.start * buffer.duration : 0);
    const end = options?.end !== undefined ? options.end * buffer.duration : buffer.duration;
    const duration = options?.durationSeconds !== undefined ? options.durationSeconds : end - startOffset;

    if (duration > 0 && options?.durationSeconds !== undefined) {
        source.start(time, startOffset, duration);
    } else if (duration > 0) {
        source.start(time, startOffset, duration);
    } else {
        source.start(time, startOffset);
    }
  }

  private scheduleNote(
    sixteenthNoteNumber: number,
    time: number,
  ) {
    // Schedule MIDI and Virtual Instrument Rack events with sample accuracy!
    const synthNodes = this.trackNodes.get("t4"); // Virtual synth track
    const drumNodes = this.trackNodes.get("t1"); // Drum track
    this.midiScheduler.scheduleMidiClips(sixteenthNoteNumber, time, this.projectService.bpm(), synthNodes?.pannerNode, drumNodes?.pannerNode);

    const tracks = this.projectService.tracks();
    const mode = this.workspace.playbackMode();

    if (mode === 'timeline') {
      // TIMELINE ENGINE: Independent Arrangement Player Route
      const windowStart = sixteenthNoteNumber * 0.25;
      const windowEnd = windowStart + 0.25;
      const secondsPerBeat = 60.0 / this.projectService.bpm();

      for (const track of tracks) {
        const nodes = this.trackNodes.get(track.id);
        if (!nodes) continue;

        // Find clips that start within this 16th note window
        for (const clip of track.clips) {
          if (clip.start >= windowStart && clip.start < windowEnd) {
            const offsetBeats = clip.start - windowStart;
            const preciseTime = time + (offsetBeats * secondsPerBeat);
            this.playClip(clip, preciseTime, nodes.pannerNode);
          }
        }
      }
    } else if (mode === 'sequence') {
      // SEQUENCER ENGINE: Pattern Sequencer Drum Machine Route
      const stepIndex = sixteenthNoteNumber % 16;
      const sequence = this.projectService.sequence();
      for (const row of sequence) {
        if (row.steps[stepIndex]) {
          this.playOneShot(row.instrument, undefined, { start: 0, end: 1 });
        }
      }

      // PIANO ROLL MIDI Route
      const pianoStep = sixteenthNoteNumber % 16;
      const pianoNotes = this.workspace.pianoNotes();
      const keys = ["C4", "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3"];
      
      for (const note of pianoNotes) {
        const noteStep = Math.round(note.x / 32);
        if (noteStep === pianoStep) {
          const noteIndex = Math.round(note.y / 24);
          if (noteIndex >= 0 && noteIndex < keys.length) {
            const pitchName = keys[noteIndex];
            this.playOneShot(pitchName, undefined, { start: 0, end: 1 });
          }
        }
      }
    } else if (mode === 'clip') {
      // CLIP PREVIEW Route: Loop selected vocal/sampler clip
      const stepIndex = sixteenthNoteNumber % 16;
      if (stepIndex === 0) {
        const active = this.workspace.activeSample();
        if (active && active.url) {
          this.playOneShot(active.name, active.url, { start: 0, end: 1 });
        }
      }
    }
  }

  private playClip(clip: Clip, time: number, out: AudioNode) {
    const options: { pitch?: number; start?: number; end?: number; fade?: number; startSeconds?: number; durationSeconds?: number; playbackRate?: number } = {};
    const secondsPerBeat = 60.0 / this.projectService.bpm();
    
    if (clip.offset && clip.offset < 0) {
      options.startSeconds = Math.abs(clip.offset) * secondsPerBeat;
    }
    if (clip.duration !== undefined) {
      options.durationSeconds = clip.duration * secondsPerBeat;
    }
    if (clip.stretchRatio !== undefined && clip.stretchRatio !== 1.0) {
      options.playbackRate = 1.0 / clip.stretchRatio;
    }

    // Check if there is an offline imported/recorded sample with a matching clip name
    const customUrl = this.customAssetUrlMap.get(clip.name);
    if (customUrl) {
      this.playUrl(customUrl, out, time, options);
      return;
    }

    // A helper to dispatch clip playback correctly.
    // In a full implementation we'd grab the URL for the sample from a database.
    // Here we map clip names to the playOneShot implementation over to the designated 'out' node.

    // Quick mapping for github/tonejs sample URLs we added to the browser
    const urlMap: Record<string, string> = {
      "Wes Kick":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/kick.wav",
      "Wes Snare":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/snare.wav",
      "Wes Clap":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/clap.wav",
      "Wes Tom":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tom.wav",
      "Wes Boom":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/boom.wav",
      "Wes HiHat":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/hihat.wav",
      "Wes OpenHat":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/openhat.wav",
      "Wes Ride":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/ride.wav",
      "Wes Tink":
        "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tink.wav",
      "Tone Kick": "https://tonejs.github.io/audio/drum-samples/kick.mp3",
      "Tone Snare": "https://tonejs.github.io/audio/drum-samples/snare.mp3",
      "Tone Tom 1": "https://tonejs.github.io/audio/drum-samples/tom1.mp3",
      "Tone Tom 2": "https://tonejs.github.io/audio/drum-samples/tom2.mp3",
      "Tone Tom 3": "https://tonejs.github.io/audio/drum-samples/tom3.mp3",
      "Tone HiHat": "https://tonejs.github.io/audio/drum-samples/hihat.mp3",
      "Tone Cowbell": "https://tonejs.github.io/audio/drum-samples/cowbell.mp3",
      "Tone Clap": "https://tonejs.github.io/audio/drum-samples/clap.mp3",
      "Tone Crash": "https://tonejs.github.io/audio/drum-samples/crash.mp3",
      "Sub 808": "https://tonejs.github.io/audio/casio/A1.mp3",
      "Deep FM Bass": "https://tonejs.github.io/audio/casio/C2.mp3",
      "Moog Pluck": "https://tonejs.github.io/audio/casio/E2.mp3",
      "Acid 303": "https://tonejs.github.io/audio/casio/G2.mp3",
      "Slap Bass": "https://tonejs.github.io/audio/casio/A2.mp3",
      "Reese Bass": "https://tonejs.github.io/audio/casio/C3.mp3",
      "Grand Piano": "https://tonejs.github.io/audio/salamander/C4.mp3",
      "Upright Piano": "https://tonejs.github.io/audio/salamander/E3.mp3",
      "Rhodes Mark I": "https://tonejs.github.io/audio/casio/C3.mp3",
      "Wurlitzer": "https://tonejs.github.io/audio/casio/G3.mp3",
      "DX7 E-Piano": "https://tonejs.github.io/audio/casio/E4.mp3",
      "Saw Lead": "https://tonejs.github.io/audio/casio/C4.mp3",
      "Square Pluck": "https://tonejs.github.io/audio/casio/E4.mp3",
      "Trance Lead": "https://tonejs.github.io/audio/casio/G4.mp3",
      "Sine Glide": "https://tonejs.github.io/audio/casio/C5.mp3",
      "Distorted Synth": "https://tonejs.github.io/audio/casio/G5.mp3",
      "Atmos Pad": "https://tonejs.github.io/audio/loop/chords.mp3",
      "Warm Strings": "https://tonejs.github.io/audio/salamander/A4.mp3",
      "Cinematic Drone": "https://tonejs.github.io/audio/loop/acoustic.mp3",
      "Glass Pad": "https://tonejs.github.io/audio/salamander/C5.mp3",
      "Choir Ahhh": "https://tonejs.github.io/audio/salamander/A5.mp3",
      "Vox 1": "https://tonejs.github.io/audio/salamander/A4.mp3",
      "Vox 2": "https://tonejs.github.io/audio/salamander/C5.mp3",
      "Vocal Chop 01": "https://tonejs.github.io/audio/salamander/F#4.mp3",
      "Vox Ooh": "https://tonejs.github.io/audio/salamander/C4.mp3",
      "Vox Ahh": "https://tonejs.github.io/audio/salamander/A3.mp3",
      "Ad Lib Yeah": "https://tonejs.github.io/audio/salamander/D#4.mp3",
      "Robot Voice": "https://tonejs.github.io/audio/salamander/F#3.mp3",
      "Impact Deep": "https://tonejs.github.io/audio/drum-samples/kick.mp3",
      "Sweep Up 8 Bars": "https://tonejs.github.io/audio/loop/rhythm.mp3",
      "Riser FX": "https://tonejs.github.io/audio/drum-samples/clap.mp3",
      "Downlifter": "https://tonejs.github.io/audio/drum-samples/tom3.mp3",
      "Laser Pew": "https://tonejs.github.io/audio/drum-samples/cowbell.mp3",
      "White Noise": "https://tonejs.github.io/audio/drum-samples/crash.mp3",
      "House Rhythm Loop": "https://tonejs.github.io/audio/loop/rhythm.mp3",
      "Ambient Chords Loop": "https://tonejs.github.io/audio/loop/chords.mp3",
      "Acoustic Folk Loop": "https://tonejs.github.io/audio/loop/acoustic.mp3"
    };

    if (urlMap[clip.name]) {
      this.playUrl(urlMap[clip.name], out, time, options);
    } else {
      // Fallback to internal synth engine
      switch (clip.name.toLowerCase()) {
        case "kick":
        case "808 kick 01":
        case "punch kick":
        case "sub kick":
          this.playKick(time, out);
          break;
        case "snare":
        case "trap snare":
        case "acoustic snare":
          this.playSnare(time, out);
          break;
        case "clap 01":
          this.playClap(time, out);
          break;
        case "rim click":
          this.playSnare(time, out);
          break;
        case "pad_atmos":
        case "atmos pad":
          this.playSynth(time, 261.63, 1.0, "sine", out);
          break;
        case "lead_synth":
        case "saw lead":
          this.playSynth(time, 523.25, 0.5, "triangle", out);
          break;
        case "bassline":
        case "sub 808":
          this.playSynth(time, 41.2 * 2, 0.4, "sawtooth", out);
          break;
        default:
          if (clip.name.toLowerCase().includes("kick"))
            this.playKick(time, out);
          else if (clip.name.toLowerCase().includes("snare"))
            this.playSnare(time, out);
          else if (clip.name.toLowerCase().includes("hat"))
            this.playHihat(time, out);
          else if (clip.name.toLowerCase().includes("bass"))
            this.playSynth(time, 41.2 * 2, 0.4, "sawtooth", out);
          else this.playSynth(time, 440, 0.2, "sine", out);
          break;
      }
    }
  }

  private playKick(time: number, out: AudioNode) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(out);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private playSnare(time: number, out: AudioNode) {
    if (!this.audioCtx) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "triangle";
    osc.connect(gain);
    gain.connect(out);
    osc.frequency.setValueAtTime(100, time);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private playHihat(time: number, out: AudioNode) {
    if (!this.audioCtx) return;
    // Simple short burst of high frequency
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "square";
    osc.connect(gain);
    gain.connect(out);
    osc.frequency.setValueAtTime(5000, time);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  private playClap(time: number, out: AudioNode) {
    if (!this.audioCtx) return;
    // Short burst of noise/square
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "sawtooth";
    osc.connect(gain);
    gain.connect(out);
    osc.frequency.setValueAtTime(800, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  private playSynth(
    time: number,
    freq: number,
    duration: number,
    type: OscillatorType,
    out: AudioNode,
  ) {
    if (!this.audioCtx) return;
    
    const finalFreq = freq * Math.pow(2, this.synthOctave);
    const osc = this.audioCtx.createOscillator();
    osc.type = (type === "sine") ? "sine" : this.synthWaveType;
    osc.frequency.setValueAtTime(finalFreq, time);

    const filterNode = this.audioCtx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.setValueAtTime(this.synthCutoff, time);
    filterNode.frequency.exponentialRampToValueAtTime(Math.max(50, this.synthCutoff * 0.15), time + duration);
    filterNode.Q.setValueAtTime(this.synthResonance, time);

    const gain = this.audioCtx.createGain();

    osc.connect(filterNode);
    filterNode.connect(gain);
    gain.connect(out);

    gain.gain.setValueAtTime(0.0, time);
    const attack = Math.max(0.002, this.synthAttack);
    const release = Math.max(0.01, this.synthRelease);

    gain.gain.linearRampToValueAtTime(0.35, time + attack);
    gain.gain.setValueAtTime(0.35, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration + release);

    osc.start(time);
    osc.stop(time + duration + release + 0.1);
  }
}
