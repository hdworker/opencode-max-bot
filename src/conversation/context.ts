import { settingsManager } from "../settings/manager.js";

export interface ConversationContextState {
  projectId: string | null;
  sessionId: string | null;
  agent: string | null;
  model: string | null;
  variant: string | null;
}

class ConversationContext {
  get(chatId: number): ConversationContextState {
    const state = settingsManager.getConversation(chatId);
    return {
      projectId: state.currentProject,
      sessionId: state.currentSession,
      agent: state.currentAgent,
      model: state.currentModel,
      variant: state.currentVariant,
    };
  }

  setProject(chatId: number, projectId: string | null): void {
    settingsManager.updateConversation(chatId, {
      currentProject: projectId,
      currentSession: null,
    });
  }

  setSession(chatId: number, sessionId: string | null, directory?: string): void {
    const current = settingsManager.getConversation(chatId);
    const sessionDirectoryCache = { ...current.sessionDirectoryCache };
    if (sessionId && directory) sessionDirectoryCache[sessionId] = directory;
    settingsManager.updateConversation(chatId, {
      currentSession: sessionId,
      sessionDirectoryCache,
    });
  }

  getSessionDirectory(chatId: number, sessionId: string): string | null {
    return settingsManager.getConversation(chatId).sessionDirectoryCache[sessionId] ?? null;
  }

  setAgent(chatId: number, agent: string | null): void {
    settingsManager.updateConversation(chatId, { currentAgent: agent });
  }

  setModel(chatId: number, model: string | null): void {
    settingsManager.updateConversation(chatId, { currentModel: model, currentVariant: null });
  }

  setVariant(chatId: number, variant: string | null): void {
    settingsManager.updateConversation(chatId, { currentVariant: variant });
  }
}

export const conversationContext = new ConversationContext();
