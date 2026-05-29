/**
 * Professional Bus-Routing Mixer Engine (Phase 3).
 * Implements pure-TypeScript audio summation graphs with explicit buses:
 * TrackBus, SendBus, ReturnBus, MasterBus
 */

export class MasterBus {
  public inputNode: GainNode;
  public limiter: DynamicsCompressorNode;
  public outputNode: GainNode;

  constructor(ctx: AudioContext) {
    this.inputNode = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.outputNode = ctx.createGain();

    // Soft brickwall summation safety limiting
    this.limiter.threshold.setValueAtTime(-1.0, ctx.currentTime);
    this.limiter.ratio.setValueAtTime(20.0, ctx.currentTime);

    this.inputNode.connect(this.limiter);
    this.limiter.connect(this.outputNode);
    this.outputNode.connect(ctx.destination);
    
    // Sum fader headroom level
    this.outputNode.gain.setValueAtTime(0.7, ctx.currentTime);
  }

  public setVolume(volume: number, now: number) {
    this.outputNode.gain.setTargetAtTime(volume, now, 0.04);
  }
}

export class TrackBus {
  public inputNode: GainNode;
  public pannerNode: StereoPannerNode;
  public gainNode: GainNode;

  constructor(ctx: AudioContext, public trackId: string, destination: AudioNode) {
    this.inputNode = ctx.createGain();
    this.pannerNode = ctx.createStereoPanner();
    this.gainNode = ctx.createGain();

    this.inputNode.connect(this.pannerNode);
    this.pannerNode.connect(this.gainNode);
    this.gainNode.connect(destination);
  }

  public setVolume(volume: number, now: number) {
    this.gainNode.gain.setTargetAtTime(volume, now, 0.04);
  }

  public setPan(pan: number, now: number) {
    this.pannerNode.pan.setTargetAtTime(pan, now, 0.04);
  }
}

export class SendBus {
  public inputNode: GainNode;
  public fader: GainNode;

  constructor(ctx: AudioContext, public sendId: string, destination: AudioNode) {
    this.inputNode = ctx.createGain();
    this.fader = ctx.createGain();

    this.inputNode.connect(this.fader);
    this.fader.connect(destination);
  }

  public setSendLevel(level: number, now: number) {
    this.fader.gain.setTargetAtTime(level, now, 0.04);
  }
}

export class ReturnBus {
  public inputNode: GainNode;
  public outputNode: GainNode;

  constructor(ctx: AudioContext, public returnId: string, destination: AudioNode) {
    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    this.inputNode.connect(this.outputNode);
    this.outputNode.connect(destination);
  }
}

export class MixerEngine {
  public masterBus: MasterBus | null = null;
  public tracks = new Map<string, TrackBus>();
  public sends = new Map<string, SendBus>();
  public returns = new Map<string, ReturnBus>();

  /**
   * Safe setup of all active busses on context bootstrap.
   */
  public initialize(ctx: AudioContext) {
    this.masterBus = new MasterBus(ctx);
  }

  /**
   * Registers or retrieves a channel's track bus fader.
   */
  public ensureTrackBus(ctx: AudioContext, trackId: string): TrackBus {
    if (!this.masterBus) {
      this.initialize(ctx);
    }
    let bus = this.tracks.get(trackId);
    if (!bus) {
      bus = new TrackBus(ctx, trackId, this.masterBus!.inputNode);
      this.tracks.set(trackId, bus);
    }
    return bus;
  }

  /**
   * Registers or retrieves a custom send bus loop.
   */
  public ensureSendBus(ctx: AudioContext, sendId: string, targetNode: AudioNode): SendBus {
    let send = this.sends.get(sendId);
    if (!send) {
      send = new SendBus(ctx, sendId, targetNode);
      this.sends.set(sendId, send);
    }
    return send;
  }

  /**
   * Safely clears all routing matrices on project close.
   */
  public clearAll() {
    this.tracks.forEach(t => {
      try { t.gainNode.disconnect(); } catch (e) { console.debug(e); }
    });
    this.sends.forEach(s => {
      try { s.fader.disconnect(); } catch (e) { console.debug(e); }
    });
    this.returns.forEach(r => {
      try { r.outputNode.disconnect(); } catch (e) { console.debug(e); }
    });
    
    this.tracks.clear();
    this.sends.clear();
    this.returns.clear();
    this.masterBus = null;
  }
}
