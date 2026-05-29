/**
 * Professional Offline Bounce Engine & Wav Exporter (Phase 6).
 * Pure-TypeScript offline summation renderer with stereo interleaving,
 * bit-depth mapping, and PCM file structure compiler.
 */

export class WavEncoder {
  /**
   * Encodes a standard Web Audio AudioBuffer to an 16-bit PCM WAV Blob.
   */
  public static encodeWav(audioBuffer: AudioBuffer): Blob {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // Uncompressed integer LPCM
    const bitDepth = 16;
    
    let result: Float32Array;
    if (numChannels === 2) {
      result = this.interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
    } else {
      result = audioBuffer.getChannelData(0);
    }
    
    const buffer = new ArrayBuffer(44 + result.length * 2);
    const view = new DataView(buffer);
    
    // RIFF identifier
    this.writeString(view, 0, "RIFF");
    // File length
    view.setUint32(4, 36 + result.length * 2, true);
    // WAVE type
    this.writeString(view, 8, "WAVE");
    // Format chunk header
    this.writeString(view, 12, "fmt ");
    // Format chunk length
    view.setUint32(16, 16, true);
    // Sample format (raw/integer LPCM)
    view.setUint16(20, format, true);
    // Channel count
    view.setUint16(22, numChannels, true);
    // Sample rate (Hz)
    view.setUint32(24, sampleRate, true);
    // Byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    // Block align (channelCount * bytesPerSample)
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    // Bits per sample
    view.setUint16(34, bitDepth, true);
    // Data sub-chunk identifier
    this.writeString(view, 36, "data");
    // Data sub-chunk size
    view.setUint32(40, result.length * 2, true);
    
    // Write 16-bit integer PCM array values
    this.floatTo16BitPCM(view, 44, result);
    
    return new Blob([view], { type: "audio/wav" });
  }

  private static interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    
    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  }

  private static floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1.0, Math.min(1.0, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  private static writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

export interface OfflineRenderEvent {
  note: number;
  velocity: number;
  startTime: number;
  duration: number;
  instrumentType: "synth" | "drum";
}

export class OfflineRenderer {
  /**
   * Performs an offline render run inside an OfflineAudioContext.
   * Compiles the notes/samples matrix to a downloadable WAV blob.
   */
  public async renderProject(
    events: OfflineRenderEvent[],
    totalDurationSeconds: number,
    sampleRate = 44100
  ): Promise<Blob> {
    const safeDuration = Math.max(0.5, Math.min(60.0, totalDurationSeconds));
    const offlineCtx = new OfflineAudioContext(2, sampleRate * safeDuration, sampleRate);

    // Render each scheduled sound event
    for (const ev of events) {
      if (ev.instrumentType === "synth") {
        this.renderSynthSolfeggio(offlineCtx, ev);
      } else {
        this.renderDrumImpulse(offlineCtx, ev);
      }
    }

    // Trigger calculation sequence
    const renderedBuffer = await offlineCtx.startRendering();
    return WavEncoder.encodeWav(renderedBuffer);
  }

  /**
   * Fast, mathematical synth generator node injection.
   */
  private renderSynthSolfeggio(ctx: OfflineAudioContext, ev: OfflineRenderEvent) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = 440 * Math.pow(2, (ev.note - 69) / 12);
      osc.frequency.setValueAtTime(freq, ev.startTime);
      osc.type = "sawtooth";

      const gainVal = (ev.velocity / 127) * 0.3;
      gain.gain.setValueAtTime(0.001, ev.startTime);
      gain.gain.linearRampToValueAtTime(gainVal, ev.startTime + 0.02);
      gain.gain.setValueAtTime(gainVal, ev.startTime + ev.duration - 0.05);
      gain.gain.linearRampToValueAtTime(0.001, ev.startTime + ev.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ev.startTime);
      osc.stop(ev.startTime + ev.duration);
    } catch (e) {
      console.warn("WAV offline render synth exception:", e);
    }
  }

  /**
   * Fast, mathematical drum generator node injection.
   */
  private renderDrumImpulse(ctx: OfflineAudioContext, ev: OfflineRenderEvent) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const padId = (ev.note % 8) + 1;
      let freq = 60; // Kick
      let decay = 0.15;

      if (padId === 2) { freq = 220; decay = 0.18; } // Snare
      else if (padId === 3) { freq = 800; decay = 0.05; } // Hihat

      osc.frequency.setValueAtTime(freq, ev.startTime);
      if (padId === 1) {
        osc.frequency.exponentialRampToValueAtTime(30, ev.startTime + 0.08);
      }
      osc.type = padId === 3 ? "square" : "sine";

      const gainVal = (ev.velocity / 127) * 0.4;
      gain.gain.setValueAtTime(gainVal, ev.startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ev.startTime + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ev.startTime);
      osc.stop(ev.startTime + decay);
    } catch (e) {
      console.warn("WAV offline render drum exception:", e);
    }
  }
}
