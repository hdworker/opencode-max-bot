import { settingsManager } from "../settings/manager.js";

class SessionManager {
  getCurrentSession(): string | null {
    return settingsManager.getCurrentSession();
  }

  setCurrentSession(sessionId: string | null): void {
    settingsManager.setCurrentSession(sessionId);
  }

  hasActiveSession(): boolean {
    return settingsManager.getCurrentSession() !== null;
  }
}

export const sessionManager = new SessionManager();
