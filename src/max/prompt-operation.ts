export interface PromptOperation {
  chatId: number;
  sessionId: string;
  directory?: string;
  controller: AbortController;
  startedAt: number;
  watchdog?: ReturnType<typeof setTimeout>;
  phase: "running" | "finalizing";
  accepted: boolean;
}

class PromptOperationManager {
  private active = new Map<number, PromptOperation>();
  private activeSessions = new Set<string>();

  start(
    chatId: number,
    sessionId: string,
    directory?: string,
    onTimeout?: (operation: PromptOperation) => void,
    timeoutMs = 15 * 60 * 1000,
  ): AbortController {
    this.cancel(chatId);
    const controller = new AbortController();
    const operation: PromptOperation = {
      chatId,
      sessionId,
      directory,
      controller,
      startedAt: Date.now(),
      phase: "running",
      accepted: false,
    };
    operation.watchdog = setTimeout(() => {
      if (this.active.get(chatId) !== operation) return;
      this.active.delete(chatId);
      this.activeSessions.delete(sessionId);
      controller.abort(new Error("Prompt watchdog timeout"));
      onTimeout?.(operation);
    }, timeoutMs);
    operation.watchdog.unref?.();
    this.active.set(chatId, operation);
    this.activeSessions.add(sessionId);
    return controller;
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  getBySession(sessionId: string): PromptOperation | null {
    for (const operation of this.active.values()) {
      if (operation.sessionId === sessionId) return operation;
    }
    return null;
  }

  getByDirectory(directory: string): PromptOperation[] {
    return Array.from(this.active.values()).filter(
      (operation) => operation.directory === directory && operation.accepted,
    );
  }

  markAccepted(chatId: number, controller: AbortController): boolean {
    const operation = this.active.get(chatId);
    if (operation?.controller !== controller) return false;
    operation.accepted = true;
    return true;
  }

  beginFinalization(sessionId: string, chatId?: number): PromptOperation | null {
    for (const operation of this.active.values()) {
      if (operation.sessionId !== sessionId) continue;
      if (chatId !== undefined && chatId !== operation.chatId) continue;
      if (operation.phase !== "running") return null;
      operation.phase = "finalizing";
      return operation;
    }
    return null;
  }

  clear(chatId: number, controller: AbortController): void {
    if (this.active.get(chatId)?.controller === controller) {
      const operation = this.active.get(chatId);
      if (operation?.watchdog) clearTimeout(operation.watchdog);
      this.activeSessions.delete(operation?.sessionId ?? "");
      this.active.delete(chatId);
    }
  }

  completeBySession(sessionId: string, chatId?: number): PromptOperation | null {
    for (const [chatId, operation] of this.active) {
      if (operation.sessionId !== sessionId) continue;
      if (chatId !== undefined && chatId !== operation.chatId) continue;
      if (operation.watchdog) clearTimeout(operation.watchdog);
      this.active.delete(chatId);
      this.activeSessions.delete(sessionId);
      return operation;
    }
    return null;
  }

  isCurrent(chatId: number, controller: AbortController): boolean {
    return this.active.get(chatId)?.controller === controller;
  }

  cancel(chatId: number): void {
    const operation = this.active.get(chatId);
    if (!operation) return;
    if (operation.watchdog) clearTimeout(operation.watchdog);
    operation.controller.abort();
    this.active.delete(chatId);
    this.activeSessions.delete(operation.sessionId);
  }
}

export const promptOperationManager = new PromptOperationManager();
