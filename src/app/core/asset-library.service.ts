import { Injectable, signal, inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ProjectService, Track } from "./project.service";
import { WorkspaceService } from "./workspace.service";
import { AudioEngineService } from "./audio-engine.service";

export interface OfflineProject {
  id: string;
  name: string;
  createdAt: string;
  bpm: number;
  tracks: Track[];
  sequence: { instrument: string; color: string; steps: boolean[] }[];
  pianoNotes: { id: string; x: number; y: number; w: number; h: number }[];
}

export interface OfflinePreset {
  id: string;
  name: string;
  createdAt: string;
  type: "synth" | "fx";
  synthParams?: {
    cutoff: number;
    resonance: number;
    attack: number;
    release: number;
    waveType: OscillatorType;
    octave: number;
  };
  fxParams?: Partial<Track>;
}

export interface OfflineAsset {
  id: string;
  name: string;
  category: "recorded" | "imported" | "generated";
  createdAt: string;
  format: string; // e.g., 'audio/webm' or 'audio/wav'
  blobUrl?: string; // transient preview URL
}

@Injectable({ providedIn: "root" })
export class AssetLibraryService {
  private platformId = inject(PLATFORM_ID);
  private project = inject(ProjectService);
  private workspace = inject(WorkspaceService);
  private audio = inject(AudioEngineService);

  // Reactive State Signals which match our offline items
  savedProjects = signal<OfflineProject[]>([]);
  savedPresets = signal<OfflinePreset[]>([]);
  savedAssets = signal<OfflineAsset[]>([]);

  // Mic recording states
  isRecording = signal(false);
  recordingDuration = signal(0);
  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private recordingInterval: ReturnType<typeof setInterval> | null = null;

  // Track the audio buffers loaded from custom assets
  private idb: IDBDatabase | null = null;
  private readonly DB_NAME = "AudioWorkstationOfflineDB";
  private readonly STORE_ASSETS = "AssetsBinaryStore";

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initIndexedDB();
      this.loadAllFromStorage();
    }
  }

  // --- INDEXED DB ENGINE FOR AUDIO BLOB STORAGE ---
  private initIndexedDB() {
    try {
      const request = indexedDB.open(this.DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.STORE_ASSETS)) {
          db.createObjectStore(this.STORE_ASSETS, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        this.idb = request.result;
        this.restoreAssetUrls();
      };
      request.onerror = (e) => {
        console.error("IndexedDB initialization error:", e);
      };
    } catch (err) {
      console.warn("IndexedDB is disabled or unavailable:", err);
    }
  }

  private saveAssetBlobToIDB(id: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.idb) {
        reject("IndexedDB not ready");
        return;
      }
      try {
        const transaction = this.idb.transaction(this.STORE_ASSETS, "readwrite");
        const store = transaction.objectStore(this.STORE_ASSETS);
        const req = store.put({ id, blob });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  private getAssetBlobFromIDB(id: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.idb) {
        resolve(null);
        return;
      }
      try {
        const transaction = this.idb.transaction(this.STORE_ASSETS, "readonly");
        const store = transaction.objectStore(this.STORE_ASSETS);
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            resolve(req.result.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private deleteAssetBlobFromIDB(id: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.idb) {
        resolve();
        return;
      }
      try {
        const transaction = this.idb.transaction(this.STORE_ASSETS, "readwrite");
        const store = transaction.objectStore(this.STORE_ASSETS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // Reloads all indexes, lists and links
  private loadAllFromStorage() {
    // 1. Projects metadata
    const projData = localStorage.getItem("workspace_saved_projects");
    if (projData) {
      try {
        this.savedProjects.set(JSON.parse(projData));
      } catch {
        this.savedProjects.set([]);
      }
    }

    // 2. Presets metadata
    const presData = localStorage.getItem("workspace_saved_presets");
    if (presData) {
      try {
        this.savedPresets.set(JSON.parse(presData));
      } catch {
        this.savedPresets.set([]);
      }
    }

    // 3. Audio Assets index metadata
    const assetData = localStorage.getItem("workspace_saved_assets");
    if (assetData) {
      try {
        this.savedAssets.set(JSON.parse(assetData));
      } catch {
        this.savedAssets.set([]);
      }
    }
  }

  // Restore transient Blob URLs from IndexedDB for live playback after restart
  private async restoreAssetUrls() {
    const list = this.savedAssets();
    const updatedList = [...list];
    let changed = false;

    for (let i = 0; i < updatedList.length; i++) {
      const asset = updatedList[i];
      if (!asset.blobUrl) {
        const blob = await this.getAssetBlobFromIDB(asset.id);
        if (blob) {
          const u = URL.createObjectURL(blob);
          updatedList[i] = { ...asset, blobUrl: u };
          changed = true;
          
          // Register in the custom Web Audio system cache so it plays back flawlessly!
          this.audio.getAudioBuffer(u).catch((ex) => console.warn("Failed cache pre-load", ex));
        }
      }
    }
    if (changed) {
      this.savedAssets.set(updatedList);
    }
  }

  // --- SAVE & LOAD CONCRETE PROJECTS ---
  saveProjectOffline(customName: string): OfflineProject {
    const pId = "proj_" + Date.now();
    const project: OfflineProject = {
      id: pId,
      name: customName || `Untitled Session (${new Date().toLocaleDateString()})`,
      createdAt: new Date().toISOString(),
      bpm: this.project.bpm(),
      tracks: this.project.tracks(),
      sequence: this.project.sequence(),
      pianoNotes: this.workspace.pianoNotes(),
    };

    const updated = [project, ...this.savedProjects()];
    this.savedProjects.set(updated);
    localStorage.setItem("workspace_saved_projects", JSON.stringify(updated));
    return project;
  }

  loadProjectOffline(project: OfflineProject) {
    // Inject the offline values into the active project services with transactional speed
    this.project.bpm.set(project.bpm);
    this.project.tracks.set(project.tracks);
    this.project.sequence.set(project.sequence);
    this.workspace.pianoNotes.set(project.pianoNotes);
    this.workspace.selectedClipId.set(null);
  }

  deleteProjectOffline(id: string) {
    const updated = this.savedProjects().filter((p) => p.id !== id);
    this.savedProjects.set(updated);
    localStorage.setItem("workspace_saved_projects", JSON.stringify(updated));
  }

  // --- SAVE & LOAD INSTRUMENT/SYNTH PRESETS ---
  saveSynthPresetOffline(customName: string): OfflinePreset {
    const pId = "preset_" + Date.now();
    const preset: OfflinePreset = {
      id: pId,
      name: customName || `Custom Synth (${new Date().toLocaleTimeString()})`,
      createdAt: new Date().toISOString(),
      type: "synth",
      synthParams: {
        cutoff: this.audio.synthCutoff,
        resonance: this.audio.synthResonance,
        attack: this.audio.synthAttack,
        release: this.audio.synthRelease,
        waveType: this.audio.synthWaveType,
        octave: this.audio.synthOctave,
      },
    };

    const updated = [preset, ...this.savedPresets()];
    this.savedPresets.set(updated);
    localStorage.setItem("workspace_saved_presets", JSON.stringify(updated));
    return preset;
  }

  saveFxPresetOffline(customName: string, track: Track): OfflinePreset {
    const pId = "preset_" + Date.now();
    const preset: OfflinePreset = {
      id: pId,
      name: customName || `Custom FX (${new Date().toLocaleTimeString()})`,
      createdAt: new Date().toISOString(),
      type: "fx",
      fxParams: {
        eqLow: track.eqLow,
        eqMid: track.eqMid,
        eqHigh: track.eqHigh,
        compThreshold: track.compThreshold,
        compRatio: track.compRatio,
        reverbMix: track.reverbMix,
        reverbDecay: track.reverbDecay,
        filterCutoff: track.filterCutoff,
        filterReso: track.filterReso,
        filterType: track.filterType,
        distortionDrive: track.distortionDrive,
        distortionMix: track.distortionMix,
        chorusRate: track.chorusRate,
        chorusDepth: track.chorusDepth,
        chorusMix: track.chorusMix,
        delayTime: track.delayTime,
        delayFeedback: track.delayFeedback,
        delayMix: track.delayMix
      }
    };

    const updated = [preset, ...this.savedPresets()];
    this.savedPresets.set(updated);
    localStorage.setItem("workspace_saved_presets", JSON.stringify(updated));
    return preset;
  }

  loadPresetOffline(preset: OfflinePreset) {
    if (preset.type === "synth" && preset.synthParams) {
      this.audio.updateSynthParams(preset.synthParams);
    } else if (preset.type === "fx" && preset.fxParams) {
      const activeTrackId = this.workspace.selectedTrackId();
      if (activeTrackId) {
        this.project.updateTrack(activeTrackId, preset.fxParams);
      }
    }
  }

  deletePresetOffline(id: string) {
    const updated = this.savedPresets().filter((p) => p.id !== id);
    this.savedPresets.set(updated);
    localStorage.setItem("workspace_saved_presets", JSON.stringify(updated));
  }

  // --- AUDIO IMPORT / SOUND FILE CAPTURE ---
  async importAudioFileOffline(file: File): Promise<OfflineAsset> {
    const assetId = "asset_" + Date.now();
    
    // Save to IndexedDB to sustain storage footprint
    await this.saveAssetBlobToIDB(assetId, file);
    
    const url = URL.createObjectURL(file);
    const asset: OfflineAsset = {
      id: assetId,
      name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
      category: "imported",
      createdAt: new Date().toISOString(),
      format: file.type || "audio/wav",
      blobUrl: url
    };

    // Keep state and local registry up to date
    const updatedAssets = [asset, ...this.savedAssets()];
    this.savedAssets.set(updatedAssets);
    localStorage.setItem("workspace_saved_assets", JSON.stringify(updatedAssets));

    // Cache the Web Audio decoding ahead of time!
    this.audio.getAudioBuffer(url).catch((ex) => console.warn("Pre-cache fail:", ex));

    return asset;
  }

  // --- LIVE MICROPHONE RECORDING AUDIO ACQUISITION ---
  async startMicRecording() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (!this.audio.audioCtx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audio.audioCtx = new AudioCtx();
      }
      if (this.audio.audioCtx.state === "suspended") {
        await this.audio.audioCtx.resume();
      }

      const hasAccess = await this.audio.coreEngine.recorder.requestAccess();
      if (!hasAccess) {
        throw new Error("Microphone access denied");
      }

      this.audio.coreEngine.recorder.start(this.audio.audioCtx);

      this.recordingDuration.set(0);
      this.isRecording.set(true);

      if (this.recordingInterval) clearInterval(this.recordingInterval);
      this.recordingInterval = setInterval(() => {
        this.recordingDuration.update((d) => d + 1);
      }, 1000);

    } catch (err) {
      console.error("Failed to access microphone to capture sound:", err);
      this.isRecording.set(false);
      throw err;
    }
  }

  stopMicRecording() {
    this.isRecording.set(false);
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    const audioBlob = this.audio.coreEngine.recorder.stop();
    if (audioBlob) {
      const assetId = "rec_" + Date.now();
      this.saveAssetBlobToIDB(assetId, audioBlob).then(() => {
        const localUrl = URL.createObjectURL(audioBlob);
        const asset: OfflineAsset = {
          id: assetId,
          name: `Mic Recording #${this.savedAssets().filter(a => a.category === 'recorded').length + 1}`,
          category: "recorded",
          createdAt: new Date().toISOString(),
          format: "audio/wav",
          blobUrl: localUrl
        };
        const updated = [asset, ...this.savedAssets()];
        this.savedAssets.set(updated);
        localStorage.setItem("workspace_saved_assets", JSON.stringify(updated));

        // Warm up sound cache
        this.audio.getAudioBuffer(localUrl).catch((ex) => console.warn("Warm up cache failed:", ex));
      });
    }
  }

  async deleteAssetOffline(id: string) {
    const asset = this.savedAssets().find((a) => a.id === id);
    if (asset?.blobUrl) {
      try {
        URL.revokeObjectURL(asset.blobUrl);
      } catch (err) {
        console.warn("URL revocation skipped:", err);
      }
    }
    
    // Remote from binary IDB store
    await this.deleteAssetBlobFromIDB(id);

    // Filter index cache
    const updated = this.savedAssets().filter((a) => a.id !== id);
    this.savedAssets.set(updated);
    localStorage.setItem("workspace_saved_assets", JSON.stringify(updated));
  }
}
