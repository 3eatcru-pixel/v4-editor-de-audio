import { Injectable, signal, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";

export interface SynthParams {
  oscType: OscillatorType;
  attack: number;    // seconds
  decay: number;     // seconds
  sustain: number;   // 0.0 to 1.0
  release: number;   // seconds
  filterType: "lowpass" | "highpass" | "bandpass";
  filterCutoff: number; // Hz
  filterQ: number;      // resonance
  filterEnvelopeMod: number; // octave sweep amount
  filterAttack: number;
  filterDecay: number;
  lfoSpeed: number;  // Hz
  lfoAmount: number; // depth
  lfoTarget: "pitch" | "cutoff" | "none";
}

export interface DrumPadModel {
  id: number;
  name: string;
  pitch: number;     // playback rate or synth tuning
  decay: number;     // length
  filter: number;    // cutoff if applicable
  color: string;
}

@Injectable({ providedIn: "root" })
export class InstrumentRackService {
  private platformId = inject(PLATFORM_ID);
  private audioCtx: AudioContext | null = null;
  public masterGain: GainNode | null = null;

  // Active global FX insert parameters
  fxDelayMix = signal(0.15);
  fxDelayFeedback = signal(0.4);
  fxReverbMix = signal(0.12);
  fxDistortionMix = signal(0.0);

  // Modular Synth controls
  synthParams = signal<SynthParams>({
    oscType: "sawtooth",
    attack: 0.02,
    decay: 0.2,
    sustain: 0.6,
    release: 0.3,
    filterType: "lowpass",
    filterCutoff: 1200,
    filterQ: 3.5,
    filterEnvelopeMod: 1500,
    filterAttack: 0.05,
    filterDecay: 0.35,
    lfoSpeed: 4.5,
    lfoAmount: 200,
    lfoTarget: "cutoff",
  });

  // Sampler Drum Rack definition
  drumPads = signal<DrumPadModel[]>([
    { id: 1, name: "KICK 808", pitch: 48, decay: 0.5, filter: 120, color: "#ef4444" },
    { id: 2, name: "SNARE COMP", pitch: 60, decay: 0.25, filter: 2000, color: "#3b82f6" },
    { id: 3, name: "CLOSED HAT", pitch: 72, decay: 0.08, filter: 8000, color: "#eab308" },
    { id: 4, name: "OPEN Hat", pitch: 72, decay: 0.35, filter: 6000, color: "#f97316" },
    { id: 5, name: "CRASH CYMB", pitch: 84, decay: 0.8, filter: 10000, color: "#e318d1" },
    { id: 6, name: "MID TOM", pitch: 53, decay: 0.4, filter: 400, color: "#06b6d4" },
    { id: 7, name: "CLAP SOUL", pitch: 62, decay: 0.2, filter: 2500, color: "#10b981" },
    { id: 8, name: "RIMSHOT", pitch: 78, decay: 0.05, filter: 4000, color: "#ec4899" },
  ]);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initNodes();
    }
  }

  private initNodes() {
    if (typeof window !== "undefined" && !this.audioCtx) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.audioCtx.destination);
      } catch (e) {
        console.warn("Failed to instantiate Instrument Rack Audio AudioContext", e);
      }
    }
  }

  ensureAudioContext(): AudioContext {
    this.initNodes();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    if (this.audioCtx) {
      return this.audioCtx;
    }
    if (isPlatformBrowser(this.platformId)) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      return new AudioCtx();
    }
    // Return dummy or empty object mock if server-side (prevent crashes)
    return {} as unknown as AudioContext;
  }

  midiToFreq(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Triggers a Synth sequence or live note event using dedicated audio schedules
   */
  triggerSynth(midiNote: number, velocity: number, startTime: number, duration: number, out?: AudioNode) {
    const ctx = this.ensureAudioContext();
    const config = this.synthParams();
    const freq = this.midiToFreq(midiNote);

    // 1. Create Oscillator Route
    const osc = ctx.createOscillator();
    osc.type = config.oscType;
    osc.frequency.setValueAtTime(freq, startTime);

    // 2. Multi-mode Filter setting
    const filter = ctx.createBiquadFilter();
    filter.type = config.filterType;
    filter.Q.setValueAtTime(config.filterQ, startTime);

    // Filter Envelope sweep setup
    const initialCutoff = config.filterCutoff;
    const peakCutoff = initialCutoff + config.filterEnvelopeMod;
    filter.frequency.setValueAtTime(initialCutoff, startTime);
    filter.frequency.linearRampToValueAtTime(peakCutoff, startTime + Math.min(duration, config.filterAttack));
    filter.frequency.exponentialRampToValueAtTime(initialCutoff, startTime + Math.min(duration, config.filterAttack + config.filterDecay));

    // 3. Amplifier Gain Node (Amp ADSR envelope)
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, startTime);
    
    // Attack phase
    const velFactor = velocity / 127;
    amp.gain.linearRampToValueAtTime(0.4 * velFactor, startTime + Math.max(0.002, config.attack));
    
    // Decay toward sustain level
    const decayTime = startTime + Math.max(0.002, config.attack) + config.decay;
    amp.gain.setValueAtTime(0.4 * velFactor, startTime + Math.max(0.002, config.attack));
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.4 * velFactor * config.sustain), decayTime);

    // Release phase schedule
    const releaseTime = startTime + duration;
    amp.gain.setValueAtTime(Math.max(0.001, 0.4 * velFactor * config.sustain), releaseTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, releaseTime + Math.max(0.01, config.release));

    // 4. LFO modulation channel
    let lfoOsc: OscillatorNode | null = null;
    if (config.lfoTarget !== "none" && config.lfoAmount > 0) {
      lfoOsc = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoOsc.frequency.setValueAtTime(config.lfoSpeed, startTime);
      lfoGain.gain.setValueAtTime(config.lfoAmount, startTime);

      lfoOsc.connect(lfoGain);

      if (config.lfoTarget === "pitch") {
        lfoGain.connect(osc.frequency);
      } else if (config.lfoTarget === "cutoff") {
        lfoGain.connect(filter.frequency);
      }

      lfoOsc.start(startTime);
      lfoOsc.stop(releaseTime + config.release);
    }

    // Connect DSP Chain
    osc.connect(filter);
    filter.connect(amp);
    this.connectFXAndOutput(amp, startTime, out);

    osc.start(startTime);
    osc.stop(releaseTime + config.release);
  }

  /**
   * Synthesizes 100% offline MPC drum machine beats with native DSP oscillators and noise generators!
   */
  triggerDrumPad(padId: number, velocity: number, startTime: number, out?: AudioNode) {
    const ctx = this.ensureAudioContext();
    const pad = this.drumPads().find((p) => p.id === padId) || this.drumPads()[1];
    const velocityScale = velocity / 127;

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(velocityScale * 0.5, startTime);

    if (padId === 1) {
      // --- ANOLOG KICK DRUM MODEL ---
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      // Fast exponential pitch bend down to recreate sub depth pump
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.12);

      gain.gain.setValueAtTime(1.0, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + pad.decay);

      osc.connect(gain);
      gain.connect(outGain);

      osc.start(startTime);
      osc.stop(startTime + pad.decay);
    } else if (padId === 2 || padId === 7 || padId === 8) {
      // --- WHITE NOISE COMPRESSED SNARE / CLAP ---
      const bufferSize = ctx.sampleRate * pad.decay;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(pad.filter, startTime);

      // Low pitch tone to add wood shell fundamental body to sound
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = "triangle";
      bodyOsc.frequency.setValueAtTime(180, startTime);
      bodyOsc.frequency.linearRampToValueAtTime(120, startTime + 0.08);

      bodyGain.gain.setValueAtTime(0.5, startTime);
      bodyGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);

      bodyOsc.connect(bodyGain);
      bodyGain.connect(outGain);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, startTime);
      
      if (padId === 7) {
        // Clap micro staggered triggers "double hit"
        noiseGain.gain.setValueAtTime(0.0, startTime);
        noiseGain.gain.setValueAtTime(0.8, startTime + 0.01);
        noiseGain.gain.setValueAtTime(0.2, startTime + 0.015);
        noiseGain.gain.setValueAtTime(0.9, startTime + 0.025);
      }

      noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + pad.decay);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(outGain);

      noise.start(startTime);
      noise.stop(startTime + pad.decay);

      bodyOsc.start(startTime);
      bodyOsc.stop(startTime + 0.1);
    } else {
      // --- METALLIC SWEEP CLOSED/OPEN HIHAT & CYMBALS ---
      // Metal sound generated by mixing fundamental high frequency squares
      const bufferSize = ctx.sampleRate * pad.decay;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // High frequency metallic snap
        data[i] = (Math.sin(i * 0.15) * Math.sin(i * 0.23) * Math.sin(i * 0.41)) * (1 - i / bufferSize);
      }

      const metal = ctx.createBufferSource();
      metal.buffer = buffer;

      const metalFilter = ctx.createBiquadFilter();
      metalFilter.type = "highpass";
      metalFilter.frequency.setValueAtTime(pad.filter, startTime);

      const metalGain = ctx.createGain();
      metalGain.gain.setValueAtTime(0.7, startTime);
      metalGain.gain.exponentialRampToValueAtTime(0.005, startTime + pad.decay);

      metal.connect(metalFilter);
      metalFilter.connect(metalGain);
      metalGain.connect(outGain);

      metal.start(startTime);
      metal.stop(startTime + pad.decay);
    }

    this.connectFXAndOutput(outGain, startTime, out);
  }

  /**
   * Connects any active audio node into our multi-fx engine
   */
  private connectFXAndOutput(sourceNode: AudioNode, startTime: number, out?: AudioNode) {
    const ctx = sourceNode.context as AudioContext;
    const dest = out || this.masterGain || ctx.destination;

    // Direct Dry Route
    sourceNode.connect(dest);

    // --- insert 1: Stereo Echo Feedback Delay ---
    const delayMix = this.fxDelayMix();
    if (delayMix > 0) {
      const delay = ctx.createDelay();
      const fbGain = ctx.createGain();
      const wetGain = ctx.createGain();

      delay.delayTime.setValueAtTime(0.35, startTime); // approx dotted eighth 
      fbGain.gain.setValueAtTime(this.fxDelayFeedback(), startTime);
      wetGain.gain.setValueAtTime(delayMix * 0.4, startTime);

      sourceNode.connect(delay);
      delay.connect(fbGain);
      fbGain.connect(delay); // feedback loop
      delay.connect(wetGain);
      wetGain.connect(dest);
    }

    // --- insert 2: Deep Reverb Space ---
    const reverbMix = this.fxReverbMix();
    if (reverbMix > 0) {
      const convFilter = ctx.createBiquadFilter();
      convFilter.type = "highpass";
      convFilter.frequency.setValueAtTime(200, startTime); // sweep low muddiness

      const reverbGain = ctx.createGain();
      reverbGain.gain.setValueAtTime(reverbMix * 0.35, startTime);

      // Create synthetic impulse
      const rate = ctx.sampleRate;
      const length = rate * 2.5; // decay length
      const impulse = ctx.createBuffer(2, length, rate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      for (let i = 0; i < length; i++) {
        const percent = i / length;
        const dec = Math.exp(-6 * percent);
        left[i] = (Math.random() * 2 - 1) * dec * 0.35;
        right[i] = (Math.random() * 2 - 1) * dec * 0.35;
      }

      const revSource = ctx.createConvolver();
      revSource.buffer = impulse;

      sourceNode.connect(convFilter);
      convFilter.connect(revSource);
      revSource.connect(reverbGain);
      reverbGain.connect(dest);
    }
  }
}
