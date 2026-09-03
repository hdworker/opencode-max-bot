import { logger } from "../utils/logger.js";
import { settingsManager } from "../settings/manager.js";
import { projectManager } from "../project/manager.js";
import { conversationContext } from "../conversation/context.js";
import { openCodeWorkspace } from "../opencode/workspace.js";

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  variants: string[];
}

export function modelSelectionId(model: ModelInfo): string {
  return `${model.providerId}::${model.id}`;
}

class ModelManager {
  private models = new Map<number, ModelInfo[]>();

  async loadModels(chatId?: number): Promise<void> {
    try {
      this.models.set(
        chatId ?? 0,
        await openCodeWorkspace.listModels(projectManager.getCurrentProjectDirectory(chatId)),
      );
    } catch (error) {
      logger.error("[ModelManager] Failed to load models:", error);
    }
  }

  getModels(chatId?: number): ModelInfo[] {
    return this.models.get(chatId ?? 0) ?? [];
  }

  getCurrentModel(chatId?: number): string | null {
    return chatId === undefined ? settingsManager.getCurrentModel() : conversationContext.get(chatId).model;
  }

  getCurrentModelInfo(chatId?: number): ModelInfo | undefined {
    const currentModel = this.getCurrentModel(chatId);
    return currentModel
      ? this.getModels(chatId).find((model) => modelSelectionId(model) === currentModel) ??
        this.getModels(chatId).find((model) => model.id === currentModel)
      : undefined;
  }

  setCurrentModel(modelId: string | null, chatId?: number): void {
    if (chatId !== undefined) {
      conversationContext.setModel(chatId, modelId);
      return;
    }
    settingsManager.setCurrentModel(modelId);
  }

  getModelById(id: string, chatId?: number): ModelInfo | undefined {
    return this.getModels(chatId).find((m) => m.id === id);
  }

  getModelBySelectionId(selectionId: string, chatId?: number): ModelInfo | undefined {
    return this.getModels(chatId).find((model) => modelSelectionId(model) === selectionId);
  }
}

export const modelManager = new ModelManager();
