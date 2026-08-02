export type InteractionKind =
  | "question"
  | "permission"
  | "rename"
  | "task"
  | "commands"
  | "skills"
  | "context"
  | null;

export interface ActiveInteraction {
  kind: InteractionKind;
  sessionId: string;
  startedAt: number;
  allowedCommands?: string[];
}

const INTERACTION_TIMEOUT_MS = 5 * 60 * 1000;

class InteractionManager {
  private active: ActiveInteraction | null = null;

  start(kind: InteractionKind, sessionId: string, allowedCommands?: string[]): boolean {
    if (this.active) {
      return false;
    }

    this.active = {
      kind,
      sessionId,
      startedAt: Date.now(),
      allowedCommands,
    };

    return true;
  }

  isActive(): boolean {
    if (!this.active) return false;

    if (Date.now() - this.active.startedAt > INTERACTION_TIMEOUT_MS) {
      this.clear();
      return false;
    }

    return true;
  }

  getActive(): ActiveInteraction | null {
    return this.active;
  }

  clear(): void {
    this.active = null;
  }

  isKind(kind: InteractionKind): boolean {
    return this.active?.kind === kind;
  }

  isAllowedCommand(command: string): boolean {
    if (!this.active) return true;
    if (!this.active.allowedCommands) return true;
    return this.active.allowedCommands.includes(command);
  }
}

export const interactionManager = new InteractionManager();
