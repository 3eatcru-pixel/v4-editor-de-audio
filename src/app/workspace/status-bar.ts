import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { HistoryService } from '../core/history.service';
import { ProjectService } from '../core/project.service';
import { WorkspaceService } from '../core/workspace.service';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="h-8 bg-[#0b0b10] border-t border-[#1a1a24] shrink-0 flex items-center justify-between px-6 text-[10px] text-[#666] select-none">
      <div class="flex items-center gap-6 font-mono w-1/3">
        <span>CPU 12%</span>
        <span>RAM 1.2 GB</span>
      </div>

      <div class="flex gap-4 w-1/3 justify-center">
        <button class="text-[#b82bf2] border-b-2 border-[#b82bf2] pb-1 uppercase font-bold tracking-widest px-2 relative top-0.5">Project</button>
        <button class="hover:text-white pb-1 uppercase font-bold tracking-widest px-2 flex items-center gap-2 transition-colors">
          MPC Mode <span class="text-[#eab308]">👑</span>
        </button>
      </div>

      <div class="flex items-center justify-end gap-6 w-1/3">
        <button (click)="undo()" [disabled]="!history.canUndo()" [class.opacity-45]="!history.canUndo()" class="hover:text-white flex items-center gap-1.5 transition-colors font-bold border-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:hover:text-[#666]"><mat-icon class="text-[14px] w-[14px] h-[14px]">undo</mat-icon> UNDO</button>
        <button (click)="redo()" [disabled]="!history.canRedo()" [class.opacity-45]="!history.canRedo()" class="hover:text-white flex items-center gap-1.5 transition-colors font-bold border-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:hover:text-[#666]"><mat-icon class="text-[14px] w-[14px] h-[14px]">redo</mat-icon> REDO</button>
        <button (click)="save()" class="hover:text-white flex items-center gap-1.5 transition-colors ml-4 font-bold border-none bg-transparent cursor-pointer"><mat-icon class="text-[14px] w-[14px] h-[14px]">save</mat-icon> {{ saveLabel }}</button>
      </div>
    </div>
  `
})
export class StatusBarComponent {
  history = inject(HistoryService);
  project = inject(ProjectService);
  workspace = inject(WorkspaceService);
  saveLabel = 'SAVE';

  undo() {
    this.history.undo();
  }

  redo() {
    this.history.redo();
  }

  save() {
    const success = this.project.saveToStorage();
    if (success) {
      this.saveLabel = 'SAVED ✔';
      setTimeout(() => {
        this.saveLabel = 'SAVE';
      }, 2000);
    } else {
      this.saveLabel = 'ERR ✖';
      setTimeout(() => {
        this.saveLabel = 'SAVE';
      }, 2000);
    }
  }
}
