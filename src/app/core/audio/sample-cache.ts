import { DSPEngine } from "./dsp-engine";

/**
 * Sample Cache Sub-module.
 * Handles downloading, decoding Audio Buffers, and managing caching structures.
 */
export class SampleCache {
  private cache = new Map<string, AudioBuffer>();
  private loadingState = new Map<string, boolean>();

  /**
   * Safe asynchronous retrieval of decoded buffers from memory or network assets.
   */
  async getAudioBuffer(audioCtx: AudioContext | null, originalUrl: string): Promise<AudioBuffer | null> {
    if (!audioCtx) return null;
    const url = DSPEngine.cleanAudioUrl(originalUrl);
    
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    try {
      this.loadingState.set(url, true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const decodedBuf = await audioCtx.decodeAudioData(arrayBuf);
      this.cache.set(url, decodedBuf);
      this.loadingState.set(url, false);
      return decodedBuf;
    } catch (err) {
      console.error("Failed to load sample config from cache layer:", url, err);
      this.loadingState.set(url, false);
      return null;
    }
  }

  /**
   * Checks if an asset is currently in the middle of a network loading sequence.
   */
  isLoading(url: string): boolean {
    return this.loadingState.get(url) || false;
  }

  /**
   * Set loading state manually for an asset.
   */
  setLoading(url: string, isLoading: boolean) {
    this.loadingState.set(url, isLoading);
  }

  /**
   * Retrieves a loaded buffer instantly.
   */
  getDirect(url: string): AudioBuffer | undefined {
    return this.cache.get(url);
  }

  /**
   * Saves a loaded buffer manually into database structures.
   */
  saveDirect(url: string, buffer: AudioBuffer) {
    this.cache.set(url, buffer);
  }

  /**
   * Clear the complete memory caches to prevent stack leaks on project closures.
   */
  clearAll() {
    this.cache.clear();
    this.loadingState.clear();
  }
}
