import type { MaxBot } from "../bot.js";
import { modelManager, modelSelectionId } from "../../model/manager.js";
import { logger } from "../../utils/logger.js";

export function registerModelsCommand(bot: MaxBot): void {
  bot.command("models", "List available models", async (userId, chatId) => {
    try {
      await modelManager.loadModels(chatId);
      const models = modelManager.getModels(chatId);

      if (models.length === 0) {
        await bot.sendMessage(chatId, { text: "No models available." });
        return;
      }

      let text = "💃 **Models**\n\n";
      for (const model of models) {
        const current = modelManager.getCurrentModel(chatId) === modelSelectionId(model) ? " ✅" : "";
        text += `• ${model.name} (${model.providerId})${current}\n`;
      }

      await bot.sendMessage(chatId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Models] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to list models." });
    }
  });
}
