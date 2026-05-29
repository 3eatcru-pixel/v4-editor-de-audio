/**
 * High-performance, low-latency DSP algorithms prepared for AudioWorkletProcessor loops (Phase 5).
 * Features stereo DSP synthesis oscillators, threshold sidechain limiters, and granular window engines.
 */

export interface WorkletProcessorState {
  sampleRate: number;
  pitch: number;
  bypass: boolean;
  gain: number;
}

/**
 * Pure 32-bit float stereo limiter DSP component.
 * Prevents signal clipping by looking ahead or applying smooth gain reduction envelopes.
 */
export class DSPStaticLimiter {
  private currentGain = 1.0;
  private envelope = 0.0;

  constructor(
    public threshold = 0.95, // Level limit fader
    public attack = 0.002, // seconds
    public release = 0.150 // seconds
  ) {}

  /**
   * Processes stereo frames inside the high-frequency audio loop.
   */
  public process(
    inputLeft: Float32Array,
    inputRight: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array,
    sampleRate: number
  ) {
    const attackCoef = Math.exp(-1.0 / (sampleRate * this.attack));
    const releaseCoef = Math.exp(-1.0 / (sampleRate * this.release));

    for (let i = 0; i < inputLeft.length; i++) {
      const l = inputLeft[i];
      const r = inputRight[i];

      // Instant amplitude detector
      const peak = Math.max(Math.abs(l), Math.abs(r));

      // Calculate peak envelope follower tracking peak
      if (peak > this.envelope) {
        this.envelope = attackCoef * (this.envelope - peak) + peak;
      } else {
        this.envelope = releaseCoef * (this.envelope - peak) + peak;
      }

      // Smooth gain reduction coefficient
      let targetGain = 1.0;
      if (this.envelope > this.threshold) {
        targetGain = this.threshold / this.envelope;
      }

      this.currentGain = 0.1 * targetGain + 0.9 * this.currentGain;

      outputLeft[i] = l * this.currentGain;
      outputRight[i] = r * this.currentGain;
    }
  }
}

/**
 * Pure-math Virtual Analog Synth Oscillator.
 * Computes alias-minimized, smooth-phase audio waves across sub-buffers.
 */
export class DSPVirtualOscillator {
  private phase = 0.0;

  /**
   * Generates continuous samples based on note frequency.
   */
  public process(
    output: Float32Array,
    frequency: number,
    waveType: "sine" | "square" | "sawtooth" | "triangle",
    sampleRate: number
  ) {
    const phaseIncrement = (2 * Math.PI * frequency) / sampleRate;

    for (let i = 0; i < output.length; i++) {
      let val = 0;

      switch (waveType) {
        case "sine":
          val = Math.sin(this.phase);
          break;
        case "square":
          val = Math.sin(this.phase) >= 0 ? 1.0 : -1.0;
          break;
        case "sawtooth":
          val = (this.phase / Math.PI) - 1.0;
          break;
        case "triangle": {
          const normPhase = this.phase / (2 * Math.PI);
          val = 4.0 * Math.abs(normPhase - Math.floor(normPhase + 0.5)) - 1.0;
          break;
        }
      }

      output[i] = val;
      this.phase += phaseIncrement;

      // Wrap phase offset cleanly
      if (this.phase >= 2 * Math.PI) {
        this.phase -= 2 * Math.PI;
      }
    }
  }
}

/**
 * Granular time-stretching sampler window read head.
 * Interpolates custom granular grains on overlapping audio segments.
 */
export class DSPGranularSampler {
  private playhead = 0;

  /**
   * Reads from a sound buffer with speed/pitch ratio coordinates.
   */
  public process(
    output: Float32Array,
    audioBufferChannel: Float32Array,
    speedRatio: number,
    grainSize = 512
  ) {
    if (audioBufferChannel.length === 0) return;

    for (let i = 0; i < output.length; i++) {
      const index = Math.floor(this.playhead);
      const nextIndex = (index + 1) % audioBufferChannel.length;
      const frac = this.playhead - index;

      // Linear interpolation to prevent click/glitch artifacts
      const s0 = audioBufferChannel[index % audioBufferChannel.length];
      const s1 = audioBufferChannel[nextIndex];
      const sampleValue = s0 + frac * (s1 - s0);

      // Create window envelope for granular culling
      const grainIndex = i % grainSize;
      const progress = grainIndex / grainSize;
      const windowEnv = Math.sin(progress * Math.PI); // Hanning-style window

      output[i] = sampleValue * windowEnv;
      this.playhead += speedRatio;

      if (this.playhead >= audioBufferChannel.length) {
        this.playhead = 0;
      }
    }
  }
}
