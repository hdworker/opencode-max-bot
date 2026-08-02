import type { MaxBot } from "../bot.js";
import { modelManager } from "../../model/manager.js";
import { logger } from "../../utils/logger.js";

export function registerModelsCommand(bot: MaxBot): void {
  bot.command("models", "List available models", async (userId) => {
    try {
      await modelManager.loadModels();
      const models = modelManager.getModels();

      if (models.length === 0) {
        await bot.sendMessage(userId, { text: "No models available." });
        return;
      }

      let text = "🤖 **Models**\n\n";
      for (const model of models) {
        const current = modelManager.getCurrentModel() === model.id ? " ✅" : "";
        text += `• ${model.name} (${model.providerId})${current}\n`;
      }

      await bot.sendMessage(userId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Models] Error:", error);
      await bot.sendMessage(userId, { text: "❌ Failed to list models." });
    }
  });
}
