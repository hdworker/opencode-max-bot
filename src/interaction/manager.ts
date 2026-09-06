export type InteractionKind =
  | "question"
  | "question_custom"
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
  private active = new Map<number, ActiveInteraction>();

  start(
    chatId: number,
    kind: InteractionKind,
    sessionId: string,
    allowedCommands?: string[],
  ): boolean {
    if (this.active.has(chatId)) {
      return false;
    }

    this.active.set(chatId, {
      kind,
      sessionId,
      startedAt: Date.now(),
      allowedCommands,
    });

    return true;
  }

  isActive(chatId: number): boolean {
    const active = this.active.get(chatId);
    if (!active) return false;

    if (Date.now() - active.startedAt > INTERACTION_TIMEOUT_MS) {
      this.clear(chatId);
      return false;
    }

    return true;
  }

  getActive(chatId: number): ActiveInteraction | null {
    return this.active.get(chatId) ?? null;
  }

  clear(chatId: number): void {
    this.active.delete(chatId);
  }

  isKind(chatId: number, kind: InteractionKind): boolean {
    return this.active.get(chatId)?.kind === kind;
  }

  isAllowedCommand(chatId: number, command: string): boolean {
    const active = this.active.get(chatId);
    if (!active?.allowedCommands) return true;
    return active.allowedCommands.includes(command);
  }
}

export const interactionManager = new InteractionManager();
