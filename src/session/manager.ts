import { settingsManager } from "../settings/manager.js";
import { conversationContext } from "../conversation/context.js";

class SessionManager {
  getCurrentSession(chatId?: number): string | null {
    return chatId === undefined
      ? settingsManager.getCurrentSession()
      : conversationContext.get(chatId).sessionId;
  }

  setCurrentSession(
    chatId: number | undefined,
    sessionId: string | null,
    directory?: string,
  ): void {
    if (chatId !== undefined) {
      conversationContext.setSession(chatId, sessionId, directory);
      return;
    }

    settingsManager.setCurrentSession(sessionId);
    if (sessionId && directory) {
      settingsManager.setSessionDirectory(sessionId, directory);
    }
  }

  getSessionDirectory(sessionId: string, chatId?: number): string | null {
    return chatId === undefined
      ? settingsManager.getSessionDirectory(sessionId)
      : conversationContext.getSessionDirectory(chatId, sessionId);
  }

  getCurrentSessionDirectory(chatId?: number): string | null {
    const sessionId = this.getCurrentSession(chatId);
    return sessionId ? this.getSessionDirectory(sessionId, chatId) : null;
  }

  hasActiveSession(chatId?: number): boolean {
    return this.getCurrentSession(chatId) !== null;
  }
}

export const sessionManager = new SessionManager();
