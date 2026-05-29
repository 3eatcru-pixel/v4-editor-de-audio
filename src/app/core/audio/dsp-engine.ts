/**
 * Pure DSP and Tuning Mathematical Helper Module.
 * Houses waveshaper curves, impulse response generators, frequency lookups, and URL helpers.
 */
export class DSPEngine {
  /**
   * Generates a tube-like soft-clipping waveshaping curve for saturation.
   */
  static makeDistortionCurve(amount: number): Float32Array {
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

  /**
   * Mathematically synthesizes studio room acoustic decay coordinates as a Convolver Buffer.
   */
  static createReverbImpulseResponse(audioCtx: AudioContext | null, decay: number): AudioBuffer {
    const rate = audioCtx ? audioCtx.sampleRate : 44100;
    const length = rate * Math.max(0.1, decay);
    const impulse = audioCtx 
      ? audioCtx.createBuffer(2, length, rate) 
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

  /**
   * Helper to parse a musical note designation (like G#4) to its exact Hz frequency.
   */
  static noteToFreq(note: string): number {
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

  /**
   * Helper to parse a musical note designation into its standard MIDI code number (0-127).
   */
  static noteToMidi(note: string): number {
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

  /**
   * Cleans ToneJS audio URLs, ensuring proper hashtag replacement safe for browsers.
   */
  static cleanAudioUrl(url: string): string {
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

  /**
   * Maps pitch strings into closest Salamander piano sampler keys and fine-tuning semitones offsets.
   */
  static getSalamanderNoteSettings(instrument: string): { noteUrl: string; pitchOffset: number } | null {
    if (!/^[A-G]#?[0-9]$/i.test(instrument)) return null;
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
    const pitchOffset = semitoneDiff / 12; // conversion of pitch difference to octave playback rate ratio

    return { noteUrl, pitchOffset };
  }
}
