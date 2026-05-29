import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  NgZone,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ProjectService, Clip, Track } from "../core/project.service";
import { WorkspaceService } from "../core/workspace.service";
import { AudioEngineService } from "../core/audio-engine.service";
import { HistoryService } from "../core/history.service";

@Component({
  selector: "app-timeline-canvas",
  standalone: true,
  template: `
    <div
      class="w-full h-full relative overflow-hidden bg-[#0d0d12]"
      [class.cursor-default]="workspace.activeTool() === 'pointer'"
      [class.cursor-crosshair]="workspace.activeTool() === 'draw'"
      [class.cursor-cell]="workspace.activeTool() === 'cut'"
      [class.cursor-move]="workspace.activeTool() === 'join'"
      (wheel)="onWheel($event)"
      (mousedown)="onCanvasDown($event)"
      (mousemove)="onCanvasDrag($event)"
      (mouseup)="onCanvasUp()"
      (mouseleave)="onCanvasUp()"
      (dblclick)="onCanvasDblClick($event)"
    >
      <canvas
        #canvas
        class="absolute top-0 left-0 w-full h-full block pointer-events-none"
      ></canvas>
    </div>
  `,
})
export class TimelineCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild("canvas") canvasRef!: ElementRef<HTMLCanvasElement>;
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);
  history = inject(HistoryService);
  zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  audio = inject(AudioEngineService);

  private ctx!: CanvasRenderingContext2D;
  private reqId = 0;
  private resizeObserver!: ResizeObserver;

  TRACK_HEIGHT = 72;
  isDraggingCanvas = false;

  getSnappedTime(beats: number): number {
    const snap = this.workspace.snapMode();
    const grid = this.workspace.gridSize();

    if (snap === "Off") {
      return beats;
    }

    let snapInterval = 0.25; // default 1/16
    if (snap === "Bar") {
      snapInterval = 4.0;
    } else if (snap === "Beat") {
      snapInterval = 1.0;
    } else if (snap === "Grid") {
      if (grid === "1/4") snapInterval = 1.0;
      else if (grid === "1/8") snapInterval = 0.5;
      else if (grid === "1/16") snapInterval = 0.25;
      else if (grid === "1/32") snapInterval = 0.125;
      else if (grid === "Off") snapInterval = 0.001; // basically off
    }

    return Math.round(beats / snapInterval) * snapInterval;
  }

  draggedClip: {
    trackId: string;
    clipId: string;
    offsetX: number;
    initialStart: number;
    initialDuration: number;
    initialOffset: number;
  } | null = null;
  private draggedAutomation: {
    trackId: string;
    param: "volume" | "pan";
  } | null = null;

  boxSelectStart: { x: number; y: number } | null = null;
  boxSelectEnd: { x: number; y: number } | null = null;
  dragMode: 'none' | 'move' | 'resize-start' | 'resize-end' | 'slip' | 'stretch' | 'box-select' = 'none';

  onCanvasDown(e: MouseEvent) {
    this.isDraggingCanvas = true;

    const tool = this.workspace.activeTool();
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const totalX = x + this.workspace.scrollX();
    const totalY = y + this.workspace.scrollY();

    const beats = Math.max(0, totalX / this.workspace.zoomX());
    const snappedTime = this.getSnappedTime(beats);
    const trackIndex = Math.floor(totalY / this.TRACK_HEIGHT);
    const tracks = this.project.tracks();

    if (trackIndex >= 0 && trackIndex < tracks.length) {
      const track = tracks[trackIndex];
      if (track.showAutomation) {
        this.draggedAutomation = {
          trackId: track.id,
          param: track.automationParam,
        };
        this.setOrUpdateAutomation(e, track.id, track.automationParam);
        return;
      }
    }

    // Find if a clip was clicked
    let clickedClip: Clip | null | undefined = null;
    let clickedTrack: Track | null = null;
    if (trackIndex >= 0 && trackIndex < tracks.length) {
      clickedTrack = tracks[trackIndex];
      clickedClip = clickedTrack.clips.find(
        (c: Clip) => beats >= c.start && beats <= c.start + c.duration,
      );
    }

    if (clickedClip) {
      tracks.forEach(t => t.clips.forEach(c => {
        if (c.id !== clickedClip.id && !e.shiftKey) {
          c.selected = false;
        }
      }));
      clickedClip.selected = true;
      this.workspace.selectedClipId.set(clickedClip.id);
      this.workspace.selectedTrackId.set(clickedTrack!.id);

      const clipX = (beats - clickedClip.start) * this.workspace.zoomX();
      const clipW = clickedClip.duration * this.workspace.zoomX();

      if (tool === "pointer" || tool === "join") {
        if (clipX < 10 && clickedClip.duration > 0.1) {
          this.dragMode = 'resize-start';
        } else if (clipX > clipW - 10 && clickedClip.duration > 0.1) {
          this.dragMode = 'resize-end';
        } else {
          this.dragMode = 'move';
        }
      } else if (tool === "slip") {
        this.dragMode = 'slip';
      } else if (tool === "stretch") {
        this.dragMode = 'stretch';
      } else {
        this.dragMode = 'move';
      }

      this.draggedClip = {
        trackId: clickedTrack!.id,
        clipId: clickedClip.id,
        offsetX: beats - clickedClip.start,
        initialStart: clickedClip.start,
        initialDuration: clickedClip.duration,
        initialOffset: clickedClip.offset || 0,
      };
      return;
    }

    // If empty area and pointer tool -> start Box Selection
    if (tool === "pointer") {
      this.dragMode = 'box-select';
      this.boxSelectStart = { x: totalX, y: totalY };
      this.boxSelectEnd = { x: totalX, y: totalY };
      tracks.forEach(t => t.clips.forEach(c => c.selected = false));
      this.workspace.selectedClipId.set(null);
      return;
    }

    // Creating tracks if interacting out of bounds with creation tools
    if (
      trackIndex >= tracks.length &&
      (tool === "draw" || tool === "join" || tool === "cut")
    ) {
      if (tool === "draw") {
        this.project.addTrack("audio");
      } else {
        return;
      }
    }

    const updatedTracks = this.project.tracks();
    if (trackIndex >= 0 && trackIndex < updatedTracks.length) {
      const track = updatedTracks[trackIndex];

      if (tool === "draw") {
        const exists = track.clips.some(
          (c) => snappedTime >= c.start && snappedTime < c.start + c.duration,
        );
        if (!exists) {
          const newClip = {
            id: "c" + Date.now(),
            name: track.type === "audio" ? "Audio Clip" : "MIDI Region",
            start: snappedTime,
            duration: 4,
            offset: 0,
            color: track.color,
            selected: true,
          };
          this.workspace.selectedClipId.set(newClip.id);
          this.project.updateTrack(track.id, {
            clips: [...track.clips, newClip],
          });
          this.history.pushState();
        }
      } else if (tool === "cut") {
        const clipIndex = track.clips.findIndex(
          (c) => beats > c.start && beats < c.start + c.duration,
        );
        if (clipIndex !== -1) {
          const clip = track.clips[clipIndex];
          const cutPoint = snappedTime;

          if (cutPoint > clip.start && cutPoint < clip.start + clip.duration) {
            const clip1 = { ...clip, duration: cutPoint - clip.start };
            const clip2 = {
              ...clip,
              id: "c" + Date.now(),
              start: cutPoint,
              duration: clip.duration - (cutPoint - clip.start),
            };

            const newClips = [...track.clips];
            newClips.splice(clipIndex, 1, clip1, clip2);
            this.project.updateTrack(track.id, { clips: newClips });
            this.history.pushState();
          }
        }
      } else if (tool === "join") {
        const sortedClips = [...track.clips].sort((a, b) => a.start - b.start);
        const clipIndex = sortedClips.findIndex(
          (c) => beats >= c.start && beats <= c.start + c.duration,
        );
        if (clipIndex !== -1 && clipIndex < sortedClips.length - 1) {
          const c1 = sortedClips[clipIndex];
          const c2 = sortedClips[clipIndex + 1];
          if (Math.abs(c1.start + c1.duration - c2.start) < 0.25) {
            const joined = { ...c1, duration: c1.duration + c2.duration };
            const newClips = sortedClips.filter(
              (c) => c.id !== c1.id && c.id !== c2.id,
            );
            newClips.push(joined);
            this.project.updateTrack(track.id, { clips: newClips });
            this.history.pushState();
          }
        }
      }
    }
  }

  onCanvasDrag(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const totalX = x + this.workspace.scrollX();
    const totalY = y + this.workspace.scrollY();

    const beats = Math.max(0, totalX / this.workspace.zoomX());
    const snappedBeats = this.getSnappedTime(beats);

    if (this.draggedAutomation) {
      this.setOrUpdateAutomation(
        e,
        this.draggedAutomation.trackId,
        this.draggedAutomation.param,
      );
      return;
    }

    if (this.isDraggingCanvas) {
      if (this.dragMode === 'box-select' && this.boxSelectStart) {
        this.boxSelectEnd = { x: totalX, y: totalY };

        const tracks = this.project.tracks();
        const x1 = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
        const x2 = Math.max(this.boxSelectStart.x, this.boxSelectEnd.x);
        const y1 = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
        const y2 = Math.max(this.boxSelectStart.y, this.boxSelectEnd.y);

        tracks.forEach((track, tIdx) => {
          const trackTop = tIdx * this.TRACK_HEIGHT;
          const trackBottom = trackTop + this.TRACK_HEIGHT;
          const trackOverlaps = trackTop < y2 && trackBottom > y1;

          track.clips.forEach((clip) => {
            if (!trackOverlaps) {
              clip.selected = false;
              return;
            }
            const cx1 = clip.start * this.workspace.zoomX();
            const cx2 = cx1 + clip.duration * this.workspace.zoomX();
            const clipOverlaps = cx1 < x2 && cx2 > x1;

            clip.selected = clipOverlaps;
            if (clipOverlaps) {
              this.workspace.selectedClipId.set(clip.id);
              this.workspace.selectedTrackId.set(track.id);
            }
          });
        });

      } else if (this.draggedClip) {
        const track = this.project.tracks().find((t) => t.id === this.draggedClip!.trackId);
        if (track) {
          const clipIndex = track.clips.findIndex((c) => c.id === this.draggedClip!.clipId);
          if (clipIndex !== -1) {
            const clip = track.clips[clipIndex];
            const newClips = [...track.clips];

            if (this.dragMode === 'move') {
              const newStart = beats - this.draggedClip.offsetX;
              const snappedStart = Math.max(0, this.getSnappedTime(newStart));
              newClips[clipIndex] = {
                ...clip,
                start: snappedStart,
              };
              this.project.updateTrack(track.id, { clips: newClips });

            } else if (this.dragMode === 'resize-start') {
              const oldEnd = this.draggedClip.initialStart + this.draggedClip.initialDuration;
              const newStart = Math.min(oldEnd - 0.1, snappedBeats);
              const cropDelta = newStart - this.draggedClip.initialStart;
              newClips[clipIndex] = {
                ...clip,
                start: newStart,
                duration: oldEnd - newStart,
                offset: this.draggedClip.initialOffset + cropDelta,
              };
              this.project.updateTrack(track.id, { clips: newClips });

            } else if (this.dragMode === 'resize-end') {
              const newEnd = Math.max(clip.start + 0.1, snappedBeats);
              newClips[clipIndex] = {
                ...clip,
                duration: newEnd - clip.start,
              };
              this.project.updateTrack(track.id, { clips: newClips });

            } else if (this.dragMode === 'slip') {
              const deltaX = beats - this.draggedClip.offsetX - clip.start;
              newClips[clipIndex] = {
                ...clip,
                offset: this.draggedClip.initialOffset - deltaX,
              };
              this.project.updateTrack(track.id, { clips: newClips });

            } else if (this.dragMode === 'stretch') {
              const newEnd = Math.max(clip.start + 0.1, snappedBeats);
              const newDuration = newEnd - clip.start;
              const scalar = newDuration / (this.draggedClip.initialDuration || 1);
              newClips[clipIndex] = {
                ...clip,
                duration: newDuration,
                stretchRatio: scalar,
              };
              this.project.updateTrack(track.id, { clips: newClips });
            }
          }
        }
      } else {
        this.setPlayheadFromMouseEvent(e);
      }
    }
  }

  onCanvasUp() {
    if (this.draggedClip || this.draggedAutomation) {
      this.history.pushState();
    }
    this.isDraggingCanvas = false;
    this.draggedClip = null;
    this.draggedAutomation = null;
    this.boxSelectStart = null;
    this.boxSelectEnd = null;
    this.dragMode = 'none';
  }

  private setOrUpdateAutomation(
    e: MouseEvent,
    trackId: string,
    param: "volume" | "pan",
  ) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const totalX = x + this.workspace.scrollX();
    const totalY = y + this.workspace.scrollY();

    const beats = Math.max(0, totalX / this.workspace.zoomX());
    const snappedTime = Math.round(beats / 0.1) * 0.1;

    const tracks = this.project.tracks();
    const trackIndex = tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return;

    const trackY = trackIndex * this.TRACK_HEIGHT;
    const relY = Math.max(0, Math.min(this.TRACK_HEIGHT, totalY - trackY));

    let value = 0;
    if (param === "volume") {
      value = 1.0 - relY / this.TRACK_HEIGHT;
    } else {
      value = 1.0 - relY / (this.TRACK_HEIGHT / 2);
      value = Math.max(-1.0, Math.min(1.0, value));
    }

    this.project.setAutomationPoint(trackId, param, snappedTime, value);
  }

  onCanvasDblClick(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const totalX = x + this.workspace.scrollX();
    const totalY = y + this.workspace.scrollY();

    const beats = totalX / this.workspace.zoomX();
    const trackIndex = Math.floor(totalY / this.TRACK_HEIGHT);
    const tracks = this.project.tracks();

    if (trackIndex >= 0 && trackIndex < tracks.length) {
      const track = tracks[trackIndex];
      const clipIndex = track.clips.findIndex(
        (c) => beats >= c.start && beats <= c.start + c.duration,
      );

      if (clipIndex !== -1) {
        if (this.workspace.activeTool() === "cut") {
          const newClips = [...track.clips];
          newClips.splice(clipIndex, 1);
          this.project.updateTrack(track.id, { clips: newClips });
          this.history.pushState();
        } else {
          this.audio.playOneShot(track.clips[clipIndex].name);
        }
      }
    }
  }

  private setPlayheadFromMouseEvent(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalX = x + this.workspace.scrollX();
    const beats = Math.max(0, totalX / this.workspace.zoomX());
    const snapped = this.getSnappedTime(beats);
    this.project.playheadPosition.set(snapped);
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.canvasRef.nativeElement;
    try {
      this.ctx = canvas.getContext("2d")!;
      if (!this.ctx) return;
    } catch (e) {
      console.warn("Canvas not supported in this environment", e);
      return;
    }

    // We run the render loop outside Angular's zone to prevent change detection cycles
    // even though we are zoneless, it's good practice
    this.zone.runOutsideAngular(() => {
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement!);
      }
      this.resize();
      this.renderLoop();
    });
  }

  ngOnDestroy() {
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.reqId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  resize() {
    if (!isPlatformBrowser(this.platformId)) return;
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    // Handle high DPI displays
    const dpr =
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    if (this.ctx) this.ctx.scale(dpr, dpr);
  }

  renderLoop = () => {
    this.draw();
    if (typeof requestAnimationFrame !== "undefined") {
      this.reqId = requestAnimationFrame(this.renderLoop);
    }
  };

  onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Zoom centered on canvas left (basic zoom)
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.workspace.setZoom(this.workspace.zoomX() * zoomFactor);
    } else {
      // Pan
      e.preventDefault();
      this.workspace.setScroll(
        this.workspace.scrollX() + e.deltaX,
        this.workspace.scrollY() + e.deltaY,
      );
    }
  }

  private waveCache = new Map<string, number[]>();

  getClipWave(clipId: string): number[] {
    if (this.waveCache.has(clipId)) {
      return this.waveCache.get(clipId)!;
    }
    const peaks: number[] = [];
    const len = 300;
    for (let i = 0; i < len; i++) {
      const val = Math.sin(i * 0.1) * Math.cos(i * 0.43) + Math.sin(i * 0.05);
      peaks.push(val);
    }
    this.waveCache.set(clipId, peaks);
    return peaks;
  }

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    const width = parent.clientWidth;
    const height = parent.clientHeight;

    const zoomX = this.workspace.zoomX();
    const scrollX = this.workspace.scrollX();
    const scrollY = this.workspace.scrollY();

    // Clear
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(-scrollX, -scrollY);

    const tracks = this.project.tracks();

    // Draw Loop Range Underlay
    if (this.project.loopEnabled()) {
      const ls = this.project.loopStart() * zoomX;
      const le = this.project.loopEnd() * zoomX;
      ctx.fillStyle = "rgba(184, 43, 242, 0.06)";
      ctx.fillRect(ls, 0, le - ls, height + scrollY);

      ctx.strokeStyle = "rgba(184, 43, 242, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ls, 0);
      ctx.lineTo(ls, height + scrollY);
      ctx.moveTo(le, 0);
      ctx.lineTo(le, height + scrollY);
      ctx.stroke();
    }

    // Draw Grid (vertical lines) based on dynamic gridSize setting
    const gridSize = this.workspace.gridSize();
    let gridInterval = 0.25; // 1/16 is 0.25 beats
    if (gridSize === "1/4") gridInterval = 1.0;
    else if (gridSize === "1/8") gridInterval = 0.5;
    else if (gridSize === "1/16") gridInterval = 0.25;
    else if (gridSize === "1/32") gridInterval = 0.125;
    else if (gridSize === "Off") gridInterval = 4.0; // only bars

    const startMult = Math.floor(scrollX / (zoomX * gridInterval));
    const endMult = Math.ceil((scrollX + width) / (zoomX * gridInterval)) + 2;

    for (let m = startMult; m <= endMult; m++) {
      const beat = m * gridInterval;
      const x = beat * zoomX;

      // Style based on subdivision level
      if (Math.abs(beat % 4) < 1e-4) {
        // Bar line
        ctx.strokeStyle = "#252538";
        ctx.lineWidth = 1.4;
      } else if (Math.abs(beat % 1) < 1e-4) {
        // Beat line
        ctx.strokeStyle = "#161623";
        ctx.lineWidth = 1.0;
      } else {
        // Sub-beat grid line
        ctx.strokeStyle = "#0e0e15";
        ctx.lineWidth = 0.8;
      }

      ctx.beginPath();
      ctx.moveTo(x, scrollY);
      ctx.lineTo(x, scrollY + height);
      ctx.stroke();
    }

    // Draw Markers
    const markers = this.project.markers();
    markers.forEach((marker) => {
      const mx = marker.beat * zoomX;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, scrollY);
      ctx.lineTo(mx, scrollY + height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(mx + 4, scrollY + 4, 56, 14);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.strokeRect(mx + 4, scrollY + 4, 56, 14);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 8px monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(marker.name, mx + 8, scrollY + 11);
    });

      // Draw Tracks & Clips
      const colorEven = "#14141e";
      const colorOdd = "#0e0e15";

      const totalRows = Math.max(
        tracks.length,
        Math.ceil(height / this.TRACK_HEIGHT) +
          Math.floor(scrollY / this.TRACK_HEIGHT),
      );

      for (let i = Math.floor(scrollY / this.TRACK_HEIGHT); i < totalRows; i++) {
        const y = i * this.TRACK_HEIGHT;
        if (y > scrollY + height || y + this.TRACK_HEIGHT < scrollY) continue;

        const track = tracks[i];

        if (track && track.showAutomation) {
          // Draw a beautiful automation background gradient
          const rowGradient = ctx.createLinearGradient(0, y, 0, y + this.TRACK_HEIGHT);
          rowGradient.addColorStop(0, "rgba(6, 182, 212, 0.08)");
          rowGradient.addColorStop(1, "rgba(6, 182, 212, 0.02)");
          ctx.fillStyle = rowGradient;
          ctx.fillRect(scrollX, y, width, this.TRACK_HEIGHT);

          ctx.strokeStyle = "rgba(6, 182, 212, 0.35)";
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          ctx.moveTo(scrollX, y);
          ctx.lineTo(scrollX + width, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(scrollX, y + this.TRACK_HEIGHT);
          ctx.lineTo(scrollX + width, y + this.TRACK_HEIGHT);
          ctx.stroke();

          ctx.fillStyle = "#06b6d4";
          ctx.fillRect(scrollX, y, 4, this.TRACK_HEIGHT);
        } else {
          ctx.fillStyle = i % 2 === 0 ? colorEven : colorOdd;
          ctx.fillRect(scrollX, y, width, this.TRACK_HEIGHT);

          ctx.strokeStyle = "#1a1a24";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(scrollX, y + this.TRACK_HEIGHT);
          ctx.lineTo(scrollX + width, y + this.TRACK_HEIGHT);
          ctx.stroke();
        }

      if (!track) continue;

      // Draw Clips
      track.clips.forEach((clip) => {
        const cx = clip.start * zoomX;
        const cw = clip.duration * zoomX;

        // Viewport region culling (only render visible clips)
        if (cx + cw < scrollX || cx > scrollX + width) {
          return;
        }

        const cy = y + 4;
        const ch = this.TRACK_HEIGHT - 8;

        const isDraggingThis = this.draggedClip && this.draggedClip.clipId === clip.id;
        const isSelected = clip.selected;

        if (isDraggingThis || isSelected) {
          ctx.shadowColor = track.color;
          ctx.shadowBlur = 8;
        }

        // Clip background
        ctx.fillStyle = track.color;
        // Grey out muted clips
        if (clip.muted || track.mute) {
          ctx.fillStyle = "#4b5563";
        }
        ctx.globalAlpha = (clip.muted || track.mute) ? 0.12 : isDraggingThis ? 0.45 : 0.28;
        this.fillRoundedRect(ctx, cx, cy, cw, ch, 6);

        ctx.shadowBlur = 0;

        // Clip outline
        ctx.strokeStyle = isSelected ? "#ffffff" : track.color;
        if (clip.muted || track.mute) {
          ctx.strokeStyle = "#475569";
        }
        ctx.globalAlpha = (clip.muted || track.mute) ? 0.3 : isSelected ? 1.0 : 0.75;
        ctx.lineWidth = isSelected ? 2.5 : isDraggingThis ? 2 : 1.25;
        this.strokeRoundedRect(ctx, cx, cy, cw, ch, 6);

        // Clip Title background
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, cy, cw, 17);
        ctx.clip();
        ctx.fill();
        ctx.restore();

        // Clip Title text with Stretch and Slip metrics
        ctx.globalAlpha = (clip.muted || track.mute) ? 0.4 : 1.0;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textBaseline = "middle";

        let displayName = clip.name;
        if (clip.stretchRatio && Math.abs(clip.stretchRatio - 1.0) > 0.01) {
          displayName += ` (${clip.stretchRatio.toFixed(2)}x)`;
        }
        if (clip.offset && Math.abs(clip.offset) > 0.01) {
          const slipBeats = -clip.offset;
          displayName += ` [slip: ${slipBeats.toFixed(1)}b]`;
        }
        ctx.fillText(displayName, cx + 8, cy + 9);

        if (track.mute || clip.muted) return; // Silent waves

        // Precalculated virtualized high-performance waveforms
        ctx.fillStyle = track.color;
        if (track.type === "audio") {
          const step = Math.max(1, zoomX / 16);
          ctx.globalAlpha = 0.8;
          const peaks = this.getClipWave(clip.id);
          const drawSteps = Math.floor(cw / step);

          for (let pIdx = 0; pIdx < drawSteps; pIdx++) {
            const p = pIdx * step;
            if (p < 2 || p > cw - 4) continue;
            const peakVal = peaks[pIdx % peaks.length];
            let h = Math.abs(peakVal) * (ch - 24) * 0.53 + 2.5;

            // Fade edges
            if (p < 14) h *= p / 14;
            if (p > cw - 14) h *= (cw - p) / 14;

            ctx.fillRect(
              cx + p,
              cy + 17 + (ch - 17) / 2 - h / 2,
              step - Math.min(1, step * 0.25),
              h,
            );
          }
        } else if (track.type === "midi") {
          ctx.globalAlpha = 0.9;
          const notesCount = Math.floor(clip.duration * 3);
          for (let k = 0; k < notesCount; k++) {
            const pX = Math.abs(Math.sin((clip.start + k) * 7.23));
            const pY = Math.abs(Math.cos((clip.start + k) * 3.21));
            const pW = Math.abs(Math.sin((clip.start + k) * 11.13));

            const nx = cx + 3 + pX * (cw - 14);
            const ny = cy + 22 + pY * (ch - 32);
            const nw = 5 + pW * (zoomX / 1.5);

            if (nx + nw > cx + cw) continue;

            ctx.fillStyle = track.color;
            ctx.fillRect(nx, ny, nw, 3.5);

            ctx.strokeStyle = "#ffffff";
            ctx.globalAlpha = 0.25;
            ctx.strokeRect(nx, ny, nw, 3.5);
            ctx.globalAlpha = 0.9;
          }
        }
      });

      // Draw Automation
      if (track.showAutomation) {
        const points =
          track.automationParam === "volume"
            ? track.volumeAutomation
            : track.panAutomation;
        if (points && points.length > 0) {
          ctx.save();
          ctx.beginPath();

          const baseY = y + this.TRACK_HEIGHT / 2;

          for (let j = 0; j < points.length; j++) {
            const pt = points[j];
            const px = pt.time * zoomX;
            let py = 0;
            if (track.automationParam === "volume") {
              py = y + this.TRACK_HEIGHT - pt.value * this.TRACK_HEIGHT;
            } else {
              py = baseY - pt.value * (this.TRACK_HEIGHT / 2);
            }

            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = "#06b6d4";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#06b6d4";
          for (const pt of points) {
            const px = pt.time * zoomX;
            let py = 0;
            if (track.automationParam === "volume") {
              py = y + this.TRACK_HEIGHT - pt.value * this.TRACK_HEIGHT;
            } else {
              py = baseY - pt.value * (this.TRACK_HEIGHT / 2);
            }
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // Draw Box Selection Rect overlay
    if (this.dragMode === 'box-select' && this.boxSelectStart && this.boxSelectEnd) {
      const bx1 = this.boxSelectStart.x;
      const bx2 = this.boxSelectEnd.x;
      const by1 = this.boxSelectStart.y;
      const by2 = this.boxSelectEnd.y;

      ctx.save();
      ctx.fillStyle = "rgba(184, 43, 242, 0.14)";
      ctx.strokeStyle = "#b82bf2";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.fillRect(bx1, by1, bx2 - bx1, by2 - by1);
      ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
      ctx.restore();
    }

    // Draw Playhead
    const playheadX = this.project.playheadPosition() * zoomX;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = "#b82bf2"; // Pearl Purple
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, scrollY);
    ctx.lineTo(playheadX, scrollY + height);
    ctx.stroke();

    // Playhead glow
    ctx.shadowColor = "#b82bf2";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  fillRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  }

  strokeRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.stroke();
  }
}
