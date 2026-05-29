import {Component, inject, HostListener} from '@angular/core';
import { ProjectService } from './core/project.service';
import { WorkspaceService } from './core/workspace.service';
import { TopBarComponent } from './workspace/top-bar';
import { BrowserComponent } from './workspace/browser';
import { TimelineViewComponent } from './timeline/timeline-view';
import { BottomPanelComponent } from './workspace/bottom-panel';
import { StatusBarComponent } from './workspace/status-bar';
import { AudioEngineService } from './core/audio-engine.service';
import { HistoryService } from './core/history.service';
import { FloatingPluginEditorComponent } from './workspace/floating-plugin-editor';
import { PluginHostService } from './core/plugins/plugin-host.service';

@Component({
  selector: 'app-root',
  imports: [
    TopBarComponent,
    BrowserComponent,
    TimelineViewComponent,
    BottomPanelComponent,
    StatusBarComponent,
    FloatingPluginEditorComponent
  ],
  template: `
    <div class="h-screen w-screen flex flex-col bg-[#0b0b10] text-[#a0a0b0] font-sans overflow-hidden antialiased select-none">
      <app-top-bar class="block w-full relative z-50"></app-top-bar>

      <div class="flex-1 flex overflow-hidden min-h-0">
        <main class="flex-1 flex flex-col min-w-0 bg-[#0d0d12] relative border-[#1a1a24]" [class.border-r]="workspace.showBrowser()">
          <div class="flex-1 flex min-w-0 min-h-0 w-full h-full relative">
             <app-timeline-view></app-timeline-view>
          </div>
          
          @if (workspace.showBottomPanel()) {
            <app-bottom-panel class="block w-full animate-fade-in"></app-bottom-panel>
          }
        </main>
        
        @if (workspace.showBrowser()) {
          <app-browser class="block h-full animate-fade-in"></app-browser>
        }
      </div>

      <app-status-bar class="block w-full"></app-status-bar>

      <!-- Absolute container for floating windows -->
      <div class="absolute inset-0 z-40 pointer-events-none select-none overflow-hidden">
        @for (fp of pluginHost.floatingPlugins(); track fp.pluginId) {
          <app-floating-plugin-editor [floatingConfig]="fp"></app-floating-plugin-editor>
        }
      </div>
    </div>
  `
})
export class App {
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(e: KeyboardEvent) {
    const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (isInput) return;

    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Undo / Redo
    if (modKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        const res = this.history.redo();
        if (res) {
          this.workspace.showToast("Redo Action", "Re-applied previously undone step.");
        } else {
          this.workspace.showToast("Nothing to Redo", "No future history checkpoints are available to re-apply.");
        }
      } else {
        const res = this.history.undo();
        if (res) {
          this.workspace.showToast("Undo Action", "Reverted timeline and notes changes to the previous state.");
        } else {
          this.workspace.showToast("Nothing to Undo", "No previous history checkpoints are available.");
        }
      }
      return;
    }

    if (modKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      const res = this.history.redo();
      if (res) {
        this.workspace.showToast("Redo Action", "Re-applied previously undone step.");
      } else {
        this.workspace.showToast("Nothing to Redo", "No future history checkpoints are available to re-apply.");
      }
      return;
    }

    // Save project
    if (modKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      const success = this.project.saveToStorage();
      if (success) {
        this.workspace.showToast("Project Saved Successfully", "All tracks, clips, and sequencer adjustments stored in browser secure partition.");
      } else {
        this.workspace.showToast("Save Failed", "Unable to execute storage commit on this browser sandbox.");
      }
      return;
    }

    // Playback control
    if (e.code === 'Space') {
      e.preventDefault();
      this.project.togglePlay();
      return;
    }

    // Delete selected clip
    if (e.code === 'Delete' || e.code === 'Backspace') {
      const deleted = this.project.deleteSelectedClip();
      if (deleted) {
        e.preventDefault();
        this.history.pushState();
        this.workspace.showToast("Clip Deleted", "Selected arrangement clip has been removed.");
      }
    }
  }

  // Start the audio clock engine
  clock = inject(AudioEngineService);
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);
  history = inject(HistoryService);
  pluginHost = inject(PluginHostService);
}

