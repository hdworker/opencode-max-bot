import { logger } from "../utils/logger.js";
import { settingsManager } from "../settings/manager.js";
import { projectManager } from "../project/manager.js";
import { conversationContext } from "../conversation/context.js";
import { openCodeWorkspace } from "../opencode/workspace.js";

export interface AgentInfo {
  name: string;
  description?: string;
}

class AgentManager {
  private agents = new Map<number, AgentInfo[]>();

  async loadAgents(chatId?: number): Promise<void> {
    try {
      this.agents.set(
        chatId ?? 0,
        await openCodeWorkspace.listAgents(projectManager.getCurrentProjectDirectory(chatId)),
      );
    } catch (error) {
      logger.error("[AgentManager] Failed to load agents:", error);
    }
  }

  getAgents(chatId?: number): AgentInfo[] {
    return this.agents.get(chatId ?? 0) ?? [];
  }

  getCurrentAgent(chatId?: number): string | null {
    return chatId === undefined ? settingsManager.getCurrentAgent() : conversationContext.get(chatId).agent;
  }

  setCurrentAgent(agentName: string | null, chatId?: number): void {
    if (chatId !== undefined) {
      conversationContext.setAgent(chatId, agentName);
      return;
    }
    settingsManager.setCurrentAgent(agentName);
  }
}

export const agentManager = new AgentManager();
