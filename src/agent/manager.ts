import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";
import { settingsManager } from "../settings/manager.js";

export interface AgentInfo {
  name: string;
  description?: string;
}

class AgentManager {
  private agents: AgentInfo[] = [];
  private currentAgent: string | null = null;

  async loadAgents(): Promise<void> {
    try {
      const { data, error } = await opencodeClient.app.agents();

      if (error) {
        throw error;
      }

      const agentList = data ?? [];
      this.agents = [];

      for (const agent of agentList) {
        this.agents.push({
          name: agent.name ?? "",
          description: agent.description,
        });
      }

      this.currentAgent = settingsManager.getCurrentAgent();
    } catch (error) {
      logger.error("[AgentManager] Failed to load agents:", error);
    }
  }

  getAgents(): AgentInfo[] {
    return this.agents;
  }

  getCurrentAgent(): string | null {
    return this.currentAgent;
  }

  setCurrentAgent(agentName: string | null): void {
    this.currentAgent = agentName;
    settingsManager.setCurrentAgent(agentName);
  }
}

export const agentManager = new AgentManager();
