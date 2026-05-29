import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  scrollY = signal(0);
  scrollX = signal(0);
  zoomX = signal(120);
  trackHeight = signal(72);
  activeTool = signal<'pointer' | 'draw' | 'cut' | 'join' | 'stretch' | 'slip'>('pointer');
  selectedTrackId = signal<string>('t1');
  
  showBrowser = signal(true);
  showBottomPanel = signal(true);
  
  activeSample = signal<{name: string, url?: string} | null>(null);

  gridSize = signal<'1/4' | '1/8' | '1/16' | '1/32' | 'Off'>('1/16');
  snapMode = signal<'Bar' | 'Beat' | 'Grid' | 'Off'>('Bar');

  // Architecture Modes
  playbackMode = signal<'timeline' | 'sequence' | 'clip'>('timeline');
  editorMode = signal<'arrange' | 'sequence' | 'piano' | 'sample' | 'automation' | 'mixer'>('arrange');
  selectedClipId = signal<string | null>(null);

  // Global AI Co-Pilot Composer trigger
  aiTrigger = signal<{ target: 'beats' | 'melody' | 'both'; defaultPrompt?: string } | null>(null);

  // Global Toast Notification Channel
  toast = signal<{ title: string; desc: string } | null>(null);

  showToast(title: string, desc: string) {
    this.toast.set({ title, desc });
  }

  pianoNotes = signal<
    { id: string; x: number; y: number; w: number; h: number }[]
  >([
    { id: "1", x: 0, y: 24, w: 64, h: 24 },
    { id: "2", x: 64, y: 72, w: 32, h: 24 },
    { id: "3", x: 96, y: 120, w: 32, h: 24 },
    { id: "4", x: 128, y: 24, w: 64, h: 24 },
    { id: "5", x: 192, y: 168, w: 32, h: 24 },
    { id: "6", x: 224, y: 216, w: 32, h: 24 },
  ]);
  
  setScroll(x: number, y: number) {
    this.scrollX.set(Math.max(0, x));
    this.scrollY.set(Math.max(0, y));
  }
  
  setZoom(zoom: number) {
    this.zoomX.set(Math.max(10, Math.min(zoom, 500)));
  }
}
