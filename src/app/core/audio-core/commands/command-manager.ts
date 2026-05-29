/**
 * Professional Command Pattern and History System (Phase 8).
 * Facilitates strict, performant execute/undo/redo actions across clip coordinates,
 * MIDI notes, and track mixer parameters.
 */

export interface Command {
  id: string;
  name: string;
  execute(): void;
  undo(): void;
}

export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /**
   * Action executor and register hook.
   */
  public execute(command: Command) {
    try {
      command.execute();
      this.undoStack.push(command);
      this.redoStack = []; // reset redo chain on active inputs

      if (this.undoStack.length > 50) {
        this.undoStack.shift(); // keep storage memory minimized
      }
    } catch (e) {
      console.error(`Command execution failed: ${command.name}`, e);
    }
  }

  /**
   * Reverts the last executed action.
   */
  public undo() {
    if (this.undoStack.length === 0) return;
    const cmd = this.undoStack.pop()!;
    try {
      cmd.undo();
      this.redoStack.push(cmd);
    } catch (e) {
      console.error(`Command undo failed: ${cmd.name}`, e);
    }
  }

  /**
   * Re-applies the last reverted action.
   */
  public redo() {
    if (this.redoStack.length === 0) return;
    const cmd = this.redoStack.pop()!;
    try {
      cmd.execute();
      this.undoStack.push(cmd);
    } catch (e) {
      console.error(`Command redo failed: ${cmd.name}`, e);
    }
  }

  /**
   * Check stack availability status helper.
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Factory clean reset on project closure.
   */
  public clearAll() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
