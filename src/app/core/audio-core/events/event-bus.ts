import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";

/**
 * Type-safe interface for all event-bus messages.
 */
export interface AppEvent<T = unknown> {
  type: string;
  payload: T;
}

/**
 * Specific typed payloads for Transport-related events.
 */
export interface TickPayload {
  absoluteTicks: number; // micro-ticks count
  preciseTime: number;   // AudioContext precise scheduled time in seconds
}

export interface PlayheadPayload {
  playhead: number;      // current float beat index
}

export interface BpmPayload {
  bpm: number;
}

export interface LoopPayload {
  enabled: boolean;
  start: number;
  end: number;
}

/**
 * Unified, professional, pure-TypeScript EventBus for the DAW engine.
 * Leverages RxJS for powerful asynchronous scheduling, filtering, and subscription management.
 */
export class EventBus {
  private static instance: EventBus | null = null;
  private eventSubject = new Subject<AppEvent>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Singleton pattern to ensure a unified message hub.
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Dispatches a new event to all active streams.
   */
  public publish<T>(type: string, payload: T): void {
    this.eventSubject.next({ type, payload });
  }

  /**
   * Safe stream subscription with exact type filtering.
   */
  public on<T>(type: string): Observable<T> {
    return this.eventSubject.pipe(
      filter((e: AppEvent) => e.type === type),
      map((e: AppEvent) => e.payload as T)
    );
  }

  /**
   * Expose raw stream for telemetry and logging.
   */
  public get events$(): Observable<AppEvent> {
    return this.eventSubject.asObservable();
  }

  // --- Type-safe shortcuts for common Transport events ---
  
  public publishPlay(): void {
    this.publish<void>("transport:play", undefined);
  }

  public publishPause(): void {
    this.publish<void>("transport:pause", undefined);
  }

  public publishStop(): void {
    this.publish<void>("transport:stop", undefined);
  }

  public publishTick(payload: TickPayload): void {
    this.publish<TickPayload>("transport:tick", payload);
  }

  public publishPlayheadChange(payload: PlayheadPayload): void {
    this.publish<PlayheadPayload>("transport:playhead-change", payload);
  }

  public publishBpmChange(payload: BpmPayload): void {
    this.publish<BpmPayload>("transport:bpm-change", payload);
  }

  public publishLoopChange(payload: LoopPayload): void {
    this.publish<LoopPayload>("transport:loop-change", payload);
  }

  public onPlay$(): Observable<void> {
    return this.on<void>("transport:play");
  }

  public onPause$(): Observable<void> {
    return this.on<void>("transport:pause");
  }

  public onStop$(): Observable<void> {
    return this.on<void>("transport:stop");
  }

  public onTick$(): Observable<TickPayload> {
    return this.on<TickPayload>("transport:tick");
  }

  public onPlayheadChange$(): Observable<PlayheadPayload> {
    return this.on<PlayheadPayload>("transport:playhead-change");
  }

  public onBpmChange$(): Observable<BpmPayload> {
    return this.on<BpmPayload>("transport:bpm-change");
  }

  public onLoopChange$(): Observable<LoopPayload> {
    return this.on<LoopPayload>("transport:loop-change");
  }
}

// Global instance helper
export const eventBus = EventBus.getInstance();
