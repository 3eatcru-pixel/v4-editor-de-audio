import { WavEncoder } from "../export/offline-renderer";

export interface AudioRecorderConfig {
  onLevelUpdate?: (rms: number) => void;
}

/**
 * Professional Low-Latency Real-Time Audio Recorder (Phase 7).
 * Encapsulates raw stereo floating-point audio acquisition, RMS signal energy levels calculation,
 * and standard high-fidelity compilation of recorded audio tracks.
 */
export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  
  private leftChannel: Float32Array[] = [];
  private rightChannel: Float32Array[] = [];
  private recordingLength = 0;
  
  private isRecording = false;

  constructor(private config: AudioRecorderConfig = {}) {}

  /**
   * Asynchronously prompts the browser for microphonic stream access coordinates.
   */
  public async requestAccess(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch (e) {
      console.warn("Media devices microphone permission denied:", e);
      return false;
    }
  }

  /**
   * Starts raw PCM buffer audio stream ingestion.
   */
  public start(audioCtx: AudioContext) {
    if (!this.stream) {
      throw new Error("Microphone stream not active. Must call requestAccess() first.");
    }
    
    this.audioCtx = audioCtx;
    this.leftChannel = [];
    this.rightChannel = [];
    this.recordingLength = 0;
    this.isRecording = true;

    this.sourceNode = audioCtx.createMediaStreamSource(this.stream);
    
    // ScriptProcessorNode simplifies multi-channel raw values slicing
    this.processorNode = audioCtx.createScriptProcessor(2048, 2, 2);
    
    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      
      const left = e.inputBuffer.getChannelData(0);
      const right = e.inputBuffer.getChannelData(1);
      
      // Copy incoming floats safely for accumulative buffering
      this.leftChannel.push(new Float32Array(left));
      this.rightChannel.push(new Float32Array(right));
      this.recordingLength += left.length;
      
      // Continuous Root Mean Square calculation for meter animations
      if (this.config.onLevelUpdate) {
        let sum = 0;
        for (const val of left) {
          sum += val * val;
        }
        const rms = Math.sqrt(sum / left.length);
        this.config.onLevelUpdate(rms);
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(audioCtx.destination);
  }

  /**
   * Suspends current streams and return formatted WAV Blob.
   */
  public stop(): Blob | null {
    this.isRecording = false;
    
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (e) {
        console.debug(e);
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {
        console.debug(e);
      }
      this.sourceNode = null;
    }

    if (this.recordingLength === 0 || !this.audioCtx) return null;

    const leftBuffer = this.flattenChannel(this.leftChannel, this.recordingLength);
    const rightBuffer = this.flattenChannel(this.rightChannel, this.recordingLength);

    const recordedAudioBuffer = this.audioCtx.createBuffer(
      2,
      this.recordingLength,
      this.audioCtx.sampleRate
    );
    recordedAudioBuffer.copyToChannel(leftBuffer as unknown as Float32Array<ArrayBuffer>, 0);
    recordedAudioBuffer.copyToChannel(rightBuffer as unknown as Float32Array<ArrayBuffer>, 1);

    return WavEncoder.encodeWav(recordedAudioBuffer);
  }

  private flattenChannel(chunks: Float32Array[], length: number): Float32Array {
    const result = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  /**
   * Hard-release of hardware streams.
   */
  public destroy() {
    this.stop();
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
