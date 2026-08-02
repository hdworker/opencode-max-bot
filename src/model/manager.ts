import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";
import { settingsManager } from "../settings/manager.js";

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
}

class ModelManager {
  private models: ModelInfo[] = [];
  private currentModel: string | null = null;

  async loadModels(): Promise<void> {
    try {
      const { data, error } = await opencodeClient.config.providers();

      if (error) {
        throw error;
      }

      const providers = data?.providers ?? [];
      this.models = [];

      for (const provider of providers) {
        const modelsRecord = provider.models ?? {};
        for (const [modelId, model] of Object.entries(modelsRecord)) {
          this.models.push({
            id: modelId,
            name: model.name ?? modelId,
            providerId: provider.id ?? "",
          });
        }
      }

      this.currentModel = settingsManager.getCurrentModel();
    } catch (error) {
      logger.error("[ModelManager] Failed to load models:", error);
    }
  }

  getModels(): ModelInfo[] {
    return this.models;
  }

  getCurrentModel(): string | null {
    return this.currentModel;
  }

  setCurrentModel(modelId: string | null): void {
    this.currentModel = modelId;
    settingsManager.setCurrentModel(modelId);
  }

  getModelById(id: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === id);
  }
}

export const modelManager = new ModelManager();
