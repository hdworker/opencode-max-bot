interface PromptOperation {
  sessionId: string;
  controller: AbortController;
}

class PromptOperationManager {
  private active = new Map<number, PromptOperation>();

  start(chatId: number, sessionId: string): AbortController {
    this.cancel(chatId);
    const controller = new AbortController();
    this.active.set(chatId, { sessionId, controller });
    return controller;
  }

  clear(chatId: number, controller: AbortController): void {
    if (this.active.get(chatId)?.controller === controller) {
      this.active.delete(chatId);
    }
  }

  isCurrent(chatId: number, controller: AbortController): boolean {
    return this.active.get(chatId)?.controller === controller;
  }

  cancel(chatId: number): void {
    const operation = this.active.get(chatId);
    if (!operation) return;
    operation.controller.abort();
    this.active.delete(chatId);
  }
}

export const promptOperationManager = new PromptOperationManager();
