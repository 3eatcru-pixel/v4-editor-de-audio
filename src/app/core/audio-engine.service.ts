import { Injectable, effect, inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ProjectService, Track, Clip } from "./project.service";
import { WorkspaceService } from "./workspace.service";
import { MidiSchedulerService } from "./midi/midi-scheduler.service";
import { PluginHostService } from "./plugins/plugin-host.service";

// Core Audio sub-engine modules representing the V5 architecture
import { DSPEngine } from "./audio/dsp-engine";
import { SampleCache } from "./audio/sample-cache";
import { MixerEngine } from "./audio/mixer-engine";
import { TransportEngine } from "./audio/transport-engine";
import { AudioCoreEngine } from "./audio/audio-core-engine";
import { OfflineRenderEvent } from "./audio-core/export/offline-renderer";

@Injectable({ providedIn: "root" })
export class AudioEngineService {
  public audioCtx: AudioContext | null = null;
  private masterGain!: GainNode;

  // Decoupled sub-engine instances representing V5 Modular Architecture
  public mixerEngine = new MixerEngine();
  public sampleCache = new SampleCache();
  public transportEngine!: TransportEngine;
  
  // Unified professional pure-TypeScript core engine fader coupling
  public coreEngine!: AudioCoreEngine;

  // Active custom Synth parameter controls referenced reactively by the UI controllers
  public synthCutoff = 1500;
  public synthResonance = 2.0;
  public synthAttack = 0.05;
  public synthRelease = 0.4;
  public synthWaveType: OscillatorType = "sawtooth";
  public synthOctave = 0;

  public customAssetUrlMap = new Map<string, string>();

  private platformId = inject(PLATFORM_ID);
  private projectService = inject(ProjectService);
  private workspace = inject(WorkspaceService);
  private midiScheduler = inject(MidiSchedulerService);
  private pluginHost = inject(PluginHostService);

  // Getter to provide seamless backwards template and timeline bindings compatibility to UI components
  get trackNodes() {
    return this.mixerEngine.trackNodes;
  }

  constructor() {
    // 1. Conditionally bootstrap layout context
    this.initContext();

    // 2. Initialize the Transport Clock Engine
    this.transportEngine = new TransportEngine({
      getBpm: () => this.projectService.bpm(),
      getIsPlaying: () => this.projectService.isPlaying(),
      getPlayhead: () => this.projectService.playheadPosition(),
      setPlayhead: (pos) => this.projectService.playheadPosition.set(pos),
      getIsLooping: () => this.projectService.loopEnabled(),
      getLoopStart: () => this.projectService.loopStart(),
      getLoopEnd: () => this.projectService.loopEnd(),
      getAudioContextTime: () => this.audioCtx ? this.audioCtx.currentTime : 0,
      setCurrentStepSignal: (step) => this.projectService.currentStep.set(step),
      onScheduleNote: (stepIndex, preciseTime) => this.scheduleNote(stepIndex, preciseTime)
    });

    // 3. Setup the unified, framework-agnostic pure-TypeScript AudioCoreEngine
    this.coreEngine = new AudioCoreEngine({
      getBpm: () => this.projectService.bpm(),
      getIsLooping: () => this.projectService.loopEnabled(),
      getLoopStart: () => this.projectService.loopStart(),
      getLoopEnd: () => this.projectService.loopEnd(),
      triggerSynthNote: (midiNote, velocity, time, duration) => {
        const outNodes = this.mixerEngine.trackNodes.get("t3"); // Keys/Synth track routing
        this.playSynth(
          time,
          440 * Math.pow(2, (midiNote - 69) / 12),
          duration,
          this.synthWaveType,
          outNodes ? outNodes.pannerNode : (this.masterGain || this.audioCtx?.destination)
        );
      },
      triggerDrumNote: (padId, velocity, time) => {
        const drumNames = ["kick", "snare", "hihat", "open hat", "crash", "tom", "clap", "rim"];
        const label = drumNames[(padId - 1) % 8];
        console.debug(`Triggering pad ${padId} (velocity: ${velocity}, time: ${time})`);
        this.playOneShot(label, undefined, { start: 0, end: 1 });
      },
      onPlayheadChange: (playhead) => {
        this.projectService.playheadPosition.set(playhead);
        const current16th = Math.floor(playhead * 4);
        this.projectService.currentStep.set(current16th % 16);
      }
    });

    // Mirror variables onto our core model
    this.coreEngine.audioCtx = this.audioCtx;
    this.coreEngine.getActiveNotes = () => this.workspace.pianoNotes().map(n => {
      // adapt layout note structure to absolute MIDI indexed patterns coordinates
      const stepIndex = Math.round(n.x / 32);
      const keys = ["C4", "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3"];
      const keysLength = keys.length;
      const keyIndex = Math.round(n.y / 24) % keysLength;
      const noteName = keys[keyIndex] || "C4";
      const startTick = stepIndex * 240; // 1/16th notes PPQ intervals
      return {
        id: n.id,
        note: DSPEngine.noteToMidi(noteName),
        startTick: startTick,
        lengthTick: 240,
        velocity: 100,
        channel: 1, // Synth channel
      };
    });

    // React to playhead isPlaying state toggles automatically
    effect(() => {
      const isPlaying = this.projectService.isPlaying();
      if (isPlaying) {
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          this.audioCtx.resume();
        }
        this.transportEngine.start();
        this.coreEngine.initAudioContext();
        this.coreEngine.transport.play();
      } else {
        this.transportEngine.pause();
        this.coreEngine.transport.pause();
      }
    });

    // React to track volume, panning, mute, solo, and dynamic plug settings changes
    effect(() => {
      const tracks = this.projectService.tracks();
      this.pluginHost.trackFxChains(); // direct signal read to trigger Angular reactive track dependency
      if (this.audioCtx) {
        this.updateRouting(tracks);
      }
    });
  }

  /**
   * Safe updates to user modular synthesis sound shaping bounds.
   */
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

    // Reactively notify our transport lookahead engine of parameter edits to prevent note scheduling lags
    if (this.transportEngine) {
      this.transportEngine.forceSync();
    }
  }

  /**
   * Initializes the browser AudioContext system.
   */
  private initContext() {
    if (!this.audioCtx && isPlatformBrowser(this.platformId)) {
      try {
        const AudioCtx =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
          this.masterGain = this.audioCtx.createGain();
          this.masterGain.connect(this.audioCtx.destination);
          this.masterGain.gain.value = 0.5; // Default master sum limit
        }
      } catch (e) {
        console.warn("AudioContext bootstrap sequence failed inside context-init:", e);
      }
    }
  }

  /**
   * Synchronizes mixer stripes and parameters across changes.
   */
  private updateRouting(tracks: Track[]) {
    if (!this.audioCtx) return;

    // Clean up tracks deleted from project models
    for (const [id] of this.mixerEngine.trackNodes.entries()) {
      if (!tracks.find((t) => t.id === id)) {
        this.mixerEngine.removeTrack(id);
      }
    }

    const anySolo = tracks.some((t) => t.solo);

    for (const track of tracks) {
      // Ensure web audio nodes exist and connect to master gain fader
      this.mixerEngine.ensureTrackNodes(this.audioCtx, this.masterGain, track.id, track);

      // Setup dynamic FX plugins chains cascading
      const list = this.pluginHost.trackFxChains().get(track.id)?.plugins || [];
      this.mixerEngine.rebuildDynamicPluginsChain(this.audioCtx, track.id, list, this.pluginHost);

      // Dynamically interpolate parameters (panning, filter sweeps, volume EQs)
      this.mixerEngine.updateTrackParameters(this.audioCtx, track.id, track, anySolo);
    }
  }

  /**
   * Direct trigger to play a specific instrument or pitch instantly (Keyboard live taps or browser sample lists).
   */
  playOneShot(
    instrument: string,
    url?: string,
    options?: { pitch?: number; start?: number; end?: number; fade?: number }
  ) {
    if (!this.audioCtx) this.initContext();
    if (!this.audioCtx) return;
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();

    const time = this.audioCtx.currentTime;
    let out: AudioNode = this.masterGain;

    const name = instrument.toLowerCase();
    const isNote = /^[A-G]#?[0-9]$/i.test(instrument);

    // Track bussing / routing logic mapping naming to dedicated channels
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
      const nodes = this.mixerEngine.trackNodes.get(targetTrackId);
      if (nodes) {
        out = nodes.pannerNode;
      }
    }

    if (url) {
      this.playUrl(url, out, time, options);
      return;
    }

    if (isNote) {
      const noteSettings = DSPEngine.getSalamanderNoteSettings(instrument);
      if (noteSettings) {
        this.playUrl(noteSettings.noteUrl, out, time, { ...options, pitch: noteSettings.pitchOffset });
      }
      return;
    }

    const lowerName = instrument.toLowerCase();

    // Drum synthetically synthesized sound models fallback
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

    // Instrument Synthesizer sound generation
    if (lowerName.includes("bass") || lowerName.includes("bas")) {
      const type: OscillatorType = lowerName.includes("acid") || lowerName.includes("psy") ? "sawtooth" : "sine";
      const freq = lowerName.includes("sub") ? 32.7 : 55.0; // Low C1 or A1 frequency
      this.playSynth(time, freq, 0.4, type, out);
      return;
    }
    if (lowerName.includes("chord") || lowerName.includes("chd") || lowerName.includes("rhodes") || lowerName.includes("epiano")) {
      this.playSynth(time, 261.63, 0.2, "triangle", out); // C4 Chord fundamental
      this.playSynth(time, 311.13, 0.2, "triangle", out); // D#4
      this.playSynth(time, 392.00, 0.2, "triangle", out); // G4
      return;
    }
    if (lowerName.includes("synth") || lowerName.includes("stb") || lowerName.includes("beep") || lowerName.includes("slinky")) {
      const type: OscillatorType = lowerName.includes("rave") || lowerName.includes("square") ? "square" : "triangle";
      this.playSynth(time, 220, 0.3, type, out);
      return;
    }
    if (lowerName.includes("lead") || lowerName.includes("scream") || lowerName.includes("fl")) {
      this.playSynth(time, 659.25, 0.3, "sawtooth", out); // E5 lead pluck
      return;
    }
    if (lowerName.includes("pad") || lowerName.includes("swell") || lowerName.includes("shree") || lowerName.includes("wave") || lowerName.includes("wv")) {
      this.playSynth(time, 196.00, 0.5, "sine", out);
      return;
    }
    if (lowerName.includes("bell") || lowerName.includes("chime") || lowerName.includes("whistle")) {
      this.playSynth(time, 880, 0.2, "sine", out);
      return;
    }
    if (lowerName.includes("metronome") || lowerName.includes("clk") || lowerName.includes("click") || lowerName.includes("wood")) {
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

  /**
   * Facade getter for pre-fetching or offline decodings of asset library clips.
   */
  getAudioBuffer(originalUrl: string): Promise<AudioBuffer | null> {
    return this.sampleCache.getAudioBuffer(this.audioCtx, originalUrl);
  }

  /**
   * Facade lookups for Note to Frequency Hz values.
   */
  noteToFreq(note: string): number {
    return DSPEngine.noteToFreq(note);
  }

  /**
   * Facade lookups for Note to MIDI index tables.
   */
  noteToMidi(note: string): number {
    return DSPEngine.noteToMidi(note);
  }

  /**
   * Performs real-time playback updates on an AudioBuffer source element.
   */
  private playBuffer(
    buffer: AudioBuffer,
    out: AudioNode,
    time: number,
    options?: { pitch?: number; start?: number; end?: number; fade?: number; startSeconds?: number; durationSeconds?: number; playbackRate?: number }
  ) {
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

    if (duration > 0) {
      source.start(time, startOffset, duration);
    } else {
      source.start(time, startOffset);
    }
  }

  /**
   * Helper play dispatcher. Fetches missing buffers dynamically on-play.
   */
  private playUrl(
    originalUrl: string,
    out: AudioNode,
    time: number,
    options?: { pitch?: number; start?: number; end?: number; fade?: number; startSeconds?: number; durationSeconds?: number; playbackRate?: number }
  ) {
    if (!this.audioCtx) return;
    const url = DSPEngine.cleanAudioUrl(originalUrl);
    const buffer = this.sampleCache.getDirect(url);
    if (buffer) {
      this.playBuffer(buffer, out, time, options);
    } else {
      if (!this.sampleCache.isLoading(url)) {
        this.sampleCache.setLoading(url, true);
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP status ${res.status}`);
            return res.arrayBuffer();
          })
          .then((data) => this.audioCtx!.decodeAudioData(data))
          .then((decodedBuf) => {
            this.sampleCache.saveDirect(url, decodedBuf);
            this.sampleCache.setLoading(url, false);
            this.playBuffer(decodedBuf, out, this.audioCtx!.currentTime, options);
          })
          .catch((err) => {
            console.error("Failed to fetch sample in playUrl:", url, err);
            this.sampleCache.setLoading(url, false);
            
            // Dynamic Synth Fallback block in case of network cuts
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.includes("kick")) this.playKick(time, out);
            else if (lowerUrl.includes("snare") || lowerUrl.includes("rim")) this.playSnare(time, out);
            else if (lowerUrl.includes("hihat") || lowerUrl.includes("hat") || lowerUrl.includes("shaker")) this.playHihat(time, out);
            else if (lowerUrl.includes("clap")) this.playClap(time, out);
            else {
              const matches = url.match(/([A-G]#?[0-9])/i);
              const freq = matches ? DSPEngine.noteToFreq(matches[1]) : 440;
              this.playSynth(time, freq, 0.35, "sine", out);
            }
          });
      }
    }
  }

  /**
   * Schedules note events onto MIDI clips and synth rows synchronized of timing lookahead frames.
   */
  private scheduleNote(sixteenthNoteNumber: number, time: number) {
    const synthNodes = this.mixerEngine.trackNodes.get("t4"); // Keyboard synth channel
    const drumNodes = this.mixerEngine.trackNodes.get("t1");  // Drum sampler channel
    
    // Delegate clip scheduling
    this.midiScheduler.scheduleMidiClips(
      sixteenthNoteNumber,
      time,
      this.projectService.bpm(),
      synthNodes?.pannerNode,
      drumNodes?.pannerNode
    );

    const tracks = this.projectService.tracks();
    const mode = this.workspace.playbackMode();

    if (mode === "timeline") {
      const windowStart = sixteenthNoteNumber * 0.25;
      const windowEnd = windowStart + 0.25;
      const secondsPerBeat = 60.0 / this.projectService.bpm();

      for (const track of tracks) {
        const nodes = this.mixerEngine.trackNodes.get(track.id);
        if (!nodes) continue;

        for (const clip of track.clips) {
          if (clip.start >= windowStart && clip.start < windowEnd) {
            const offsetBeats = clip.start - windowStart;
            const preciseTime = time + (offsetBeats * secondsPerBeat);
            this.playClip(clip, preciseTime, nodes.pannerNode);
          }
        }
      }
    } else if (mode === "sequence") {
      const stepIndex = sixteenthNoteNumber % 16;
      const sequence = this.projectService.sequence();
      for (const row of sequence) {
        if (row.steps[stepIndex]) {
          this.playOneShot(row.instrument, undefined, { start: 0, end: 1 });
        }
      }

      // Roll patterns triggering
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
    } else if (mode === "clip") {
      const stepIndex = sixteenthNoteNumber % 16;
      if (stepIndex === 0) {
        const active = this.workspace.activeSample();
        if (active && active.url) {
          this.playOneShot(active.name, active.url, { start: 0, end: 1 });
        }
      }
    }
  }

  /**
   * Helper dispatch mapping arrangement clips onto specific output chains.
   */
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

    const customUrl = this.customAssetUrlMap.get(clip.name);
    if (customUrl) {
      this.playUrl(customUrl, out, time, options);
      return;
    }

    const urlMap: Record<string, string> = {
      "Wes Kick": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/kick.wav",
      "Wes Snare": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/snare.wav",
      "Wes Clap": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/clap.wav",
      "Wes Tom": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tom.wav",
      "Wes Boom": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/boom.wav",
      "Wes HiHat": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/hihat.wav",
      "Wes OpenHat": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/openhat.wav",
      "Wes Ride": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/ride.wav",
      "Wes Tink": "https://raw.githubusercontent.com/wesbos/JavaScript30/master/01%20-%20JavaScript%20Drum%20Kit/sounds/tink.wav",
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
      // Inline fallbacks
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
          if (clip.name.toLowerCase().includes("kick")) this.playKick(time, out);
          else if (clip.name.toLowerCase().includes("snare")) this.playSnare(time, out);
          else if (clip.name.toLowerCase().includes("hat")) this.playHihat(time, out);
          else if (clip.name.toLowerCase().includes("bass")) this.playSynth(time, 41.2 * 2, 0.4, "sawtooth", out);
          else this.playSynth(time, 440, 0.2, "sine", out);
          break;
      }
    }
  }

  // Pure analog synth oscillator voices models
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

  /**
   * Performs high-fidelity offline bounce rendering of all active sequencer tracks and clips.
   */
  public async exportProjectWav(): Promise<Blob> {
    const BPM = this.projectService.bpm();
    const secondsPerBeat = 60.0 / BPM;
    const secondsPerSixteenth = secondsPerBeat / 4.0;
    
    const events: OfflineRenderEvent[] = [];
    
    // 1. Gather MIDI sequence from active workspace pianoNotes
    const pianoNotes = this.workspace.pianoNotes();
    const keys = ["C4", "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3"];
    for (const note of pianoNotes) {
      const stepIndex = Math.round(note.x / 32);
      const noteIndex = Math.round(note.y / 24);
      const pitchName = keys[noteIndex] || "C4";
      const midiNote = DSPEngine.noteToMidi(pitchName);
      const startTime = stepIndex * secondsPerSixteenth;
      events.push({
        note: midiNote,
        velocity: 100,
        startTime: startTime,
        duration: secondsPerSixteenth,
        instrumentType: "synth"
      });
    }

    // 2. Wrap and loop the 16 drum sequencer rows across the project bounds
    const sequence = this.projectService.sequence();
    const maxBeats = 48;
    const totalSteps = maxBeats * 4;
    for (let step = 0; step < totalSteps; step++) {
      const stepIn16 = step % 16;
      for (let rIdx = 0; rIdx < sequence.length; rIdx++) {
        const row = sequence[rIdx];
        if (row.steps[stepIn16]) {
          const startTime = step * secondsPerSixteenth;
          events.push({
            note: rIdx + 1,
            velocity: 100,
            startTime: startTime,
            duration: 0.2,
            instrumentType: "drum"
          });
        }
      }
    }

    const totalDurationSeconds = maxBeats * secondsPerBeat;
    return await this.coreEngine.renderer.renderProject(events, totalDurationSeconds);
  }
}
