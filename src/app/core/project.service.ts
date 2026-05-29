import { Injectable, signal, inject } from "@angular/core";
import { WorkspaceService } from "./workspace.service";

export interface AutomationPoint {
  time: number;
  value: number;
}

export interface Clip {
  id: string;
  start: number;
  duration: number;
  offset: number;
  color: string;
  name: string;
  selected?: boolean;
  muted?: boolean;
  loop?: boolean;
  data?: unknown;
  stretchRatio?: number;
}

export interface Track {
  id: string;
  name: string;
  type: "audio" | "midi" | "bus";
  clips: Clip[];
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  color: string;
  volumeAutomation: AutomationPoint[];
  panAutomation: AutomationPoint[];
  showAutomation: boolean;
  automationParam: "volume" | "pan";
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  compThreshold: number;
  compRatio: number;
  reverbMix: number;
  // Professional pre-installed plugin parameters
  filterCutoff?: number;
  filterReso?: number;
  filterType?: "lowpass" | "highpass" | "bandpass";
  distortionDrive?: number;
  distortionMix?: number;
  chorusRate?: number;
  chorusDepth?: number;
  chorusMix?: number;
  delayTime?: number;
  delayFeedback?: number;
  delayMix?: number;
  reverbDecay?: number;
}

@Injectable({ providedIn: "root" })
export class ProjectService {
  tracks = signal<Track[]>([
    {
      id: "t1",
      name: "Drums",
      type: "audio",
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      color: "#a855f7",
      showAutomation: false,
      automationParam: "volume",
      volumeAutomation: [],
      panAutomation: [],
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compThreshold: -18,
      compRatio: 4,
      reverbMix: 0.15,
      clips: [
        {
          id: "c1",
          start: 0,
          duration: 16,
          offset: 0,
          color: "#a855f7",
          name: "Drums_120bpm",
        },
        {
          id: "c2",
          start: 16,
          duration: 16,
          offset: 0,
          color: "#a855f7",
          name: "Drums_120bpm",
        },
        {
          id: "c11",
          start: 32,
          duration: 16,
          offset: 0,
          color: "#a855f7",
          name: "Drums_120bpm",
        },
      ],
    },
    {
      id: "t2",
      name: "Bass",
      type: "midi",
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      color: "#06b6d4",
      showAutomation: false,
      automationParam: "volume",
      volumeAutomation: [],
      panAutomation: [],
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compThreshold: -15,
      compRatio: 3,
      reverbMix: 0.05,
      clips: [
        {
          id: "c3",
          start: 0,
          duration: 48,
          offset: 0,
          color: "#06b6d4",
          name: "Bassline",
        },
      ],
    },
    {
      id: "t3",
      name: "Keys",
      type: "midi",
      volume: 0.7,
      pan: 0,
      mute: false,
      solo: false,
      color: "#10b981",
      showAutomation: false,
      automationParam: "volume",
      volumeAutomation: [],
      panAutomation: [],
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compThreshold: -20,
      compRatio: 2.5,
      reverbMix: 0.35,
      clips: [
        {
          id: "c4",
          start: 0,
          duration: 48,
          offset: 0,
          color: "#10b981",
          name: "Pad_Atmos",
        },
      ],
    },
    {
      id: "t4",
      name: "Lead",
      type: "midi",
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
      color: "#eab308",
      showAutomation: false,
      automationParam: "volume",
      volumeAutomation: [],
      panAutomation: [],
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compThreshold: -12,
      compRatio: 2,
      reverbMix: 0.25,
      clips: [
        {
          id: "c5",
          start: 0,
          duration: 48,
          offset: 0,
          color: "#eab308",
          name: "Lead_Synth",
        },
      ],
    },
    {
      id: "t5",
      name: "Vocals",
      type: "audio",
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
      color: "#ec4899",
      showAutomation: false,
      automationParam: "volume",
      volumeAutomation: [],
      panAutomation: [],
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compThreshold: -18,
      compRatio: 3.5,
      reverbMix: 0.45,
      clips: [
        {
          id: "c6",
          start: 0,
          duration: 48,
          offset: 0,
          color: "#ec4899",
          name: "Vocal_Take_01",
        },
      ],
    },
  ]);

  bpm = signal(120);
  isPlaying = signal(false);
  playheadPosition = signal(16 * 4); // start at bar 17
  currentStep = signal(0);
  
  loopStart = signal(0);
  loopEnd = signal(16);
  loopEnabled = signal(true);
  markers = signal<{ id: string; name: string; beat: number }[]>([
    { id: "m1", name: "INTRO", beat: 0 },
    { id: "m2", name: "VERSE 1", beat: 16 },
    { id: "m3", name: "CHORUS 1", beat: 32 },
    { id: "m4", name: "OUTRO", beat: 48 }
  ]);

  // 16 steps sequencer
  sequence = signal<{ instrument: string; color: string; steps: boolean[] }[]>([
    {
      instrument: "Kick",
      color: "#3b82f6",
      steps: [
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ],
    },
    {
      instrument: "Snare",
      color: "#a855f7",
      steps: [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ],
    },
    {
      instrument: "HiHat",
      color: "#06b6d4",
      steps: [
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
      ],
    },
    {
      instrument: "Clap",
      color: "#ec4899",
      steps: [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
    },
    {
      instrument: "Bass",
      color: "#10b981",
      steps: [
        true,
        true,
        false,
        true,
        false,
        false,
        true,
        false,
        true,
        true,
        false,
        false,
        true,
        false,
        false,
        true,
      ],
    },
    {
      instrument: "Synth",
      color: "#eab308",
      steps: [
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
      ],
    },
    {
      instrument: "Pad",
      color: "#10b981",
      steps: [
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
    },
  ]);

  toggleSequenceStep(index: number, step: number) {
    this.sequence.update((s) => {
      const newSeq = [...s];
      newSeq[index].steps = [...newSeq[index].steps];
      newSeq[index].steps[step] = !newSeq[index].steps[step];
      return newSeq;
    });
  }

  togglePlay() {
    this.isPlaying.set(!this.isPlaying());
  }

  stop() {
    this.isPlaying.set(false);
    this.playheadPosition.set(0);
  }

  updateTrack(id: string, partial: Partial<Track>) {
    this.tracks.update((ts) =>
      ts.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    );
  }

  addTrack(type: "audio" | "midi") {
    const id = "t" + Date.now();
    const colors = [
      "#f43f5e",
      "#a855f7",
      "#06b6d4",
      "#10b981",
      "#f59e0b",
      "#3b82f6",
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const name = type === "audio" ? "Audio Track" : "MIDI Track";
    this.tracks.update((ts) => [
      ...ts,
      {
        id,
        name,
        type,
        clips: [],
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        color,
        showAutomation: false,
        automationParam: "volume",
        volumeAutomation: [],
        panAutomation: [],
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        compThreshold: -18,
        compRatio: 4,
        reverbMix: 0.25,
        filterCutoff: 20000,
        filterReso: 1.0,
        filterType: "lowpass",
        distortionDrive: 0,
        distortionMix: 0,
        chorusRate: 1.0,
        chorusDepth: 0,
        chorusMix: 0,
        delayTime: 0.25,
        delayFeedback: 0.35,
        delayMix: 0.15,
        reverbDecay: 2.0,
      },
    ]);
  }

  setAutomationPoint(
    trackId: string,
    param: "volume" | "pan",
    time: number,
    value: number,
  ) {
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === trackId) {
          const arr =
            param === "volume" ? [...t.volumeAutomation] : [...t.panAutomation];
          // find exact time or close to 0.1 beat
          const existingIdx = arr.findIndex(
            (p) => Math.abs(p.time - time) < 0.1,
          );
          if (existingIdx !== -1) {
            arr[existingIdx] = { time, value };
          } else {
            arr.push({ time, value });
            arr.sort((a, b) => a.time - b.time);
          }

          if (param === "volume") return { ...t, volumeAutomation: arr };
          else return { ...t, panAutomation: arr };
        }
        return t;
      }),
    );
  }

  deleteTrack(id: string) {
    this.tracks.update((ts) => ts.filter((t) => t.id !== id));
  }

  cycleTrackColor(id: string) {
    const colors = [
      "#f43f5e",
      "#a855f7",
      "#06b6d4",
      "#10b981",
      "#f59e0b",
      "#3b82f6",
      "#ec4899",
      "#8a2be2",
      "#00fa9a",
    ];
    this.tracks.update((ts) =>
      ts.map((t) => {
        if (t.id === id) {
          const currentIndex = colors.indexOf(t.color);
          const nextIndex = (currentIndex + 1) % colors.length;
          // also update color for all clips on the track to keep them synced
          return {
            ...t,
            color: colors[nextIndex],
            clips: t.clips.map((c) => ({ ...c, color: colors[nextIndex] })),
          };
        }
        return t;
      }),
    );
  }

  private workspace = inject(WorkspaceService);

  constructor() {
    setTimeout(() => {
      this.loadFromStorage();
    }, 50);
  }

  loadFromStorage() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      const stored = localStorage.getItem("sonos_daw_project");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.bpm) this.bpm.set(data.bpm);
        if (data.tracks) this.tracks.set(data.tracks);
        if (data.sequence) this.sequence.set(data.sequence);
        if (data.loopStart !== undefined) this.loopStart.set(data.loopStart);
        if (data.loopEnd !== undefined) this.loopEnd.set(data.loopEnd);
        if (data.loopEnabled !== undefined) this.loopEnabled.set(data.loopEnabled);
        if (data.pianoNotes) this.workspace.pianoNotes.set(data.pianoNotes);
      }
    } catch (e) {
      console.warn("Could not load project from localStorage", e);
    }
  }

  deleteSelectedClip(): boolean {
    const selectedId = this.workspace.selectedClipId();
    if (!selectedId) return false;

    let found = false;
    this.tracks.update((ts) =>
      ts.map((t) => {
        const contains = t.clips.some((c) => c.id === selectedId);
        if (contains) {
          found = true;
          return { ...t, clips: t.clips.filter((c) => c.id !== selectedId) };
        }
        return t;
      })
    );

    if (found) {
      this.workspace.selectedClipId.set(null);
      return true;
    }
    return false;
  }

  saveToStorage(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const projectData = {
        bpm: this.bpm(),
        tracks: this.tracks(),
        sequence: this.sequence(),
        pianoNotes: this.workspace.pianoNotes(),
        loopStart: this.loopStart(),
        loopEnd: this.loopEnd(),
        loopEnabled: this.loopEnabled(),
        timestamp: Date.now()
      };
      localStorage.setItem("sonos_daw_project", JSON.stringify(projectData));
      return true;
    } catch (e) {
      console.warn("Could not save project to localStorage", e);
      return false;
    }
  }
}
