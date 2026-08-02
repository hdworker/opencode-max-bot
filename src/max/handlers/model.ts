import type { MaxBot } from "../bot.js";
import { interactionManager } from "../../interaction/manager.js";
import { modelManager } from "../../model/manager.js";
import { agentManager } from "../../agent/manager.js";
import { variantManager } from "../../variant/manager.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";

export function registerAgentCallback(bot: MaxBot): void {
  bot.onCallback(async (userId, chatId, data, callback) => {
    if (data === "select_agent") {
      const agents = agentManager.getAgents();
      if (agents.length === 0) {
        await bot.sendMessage(chatId, { text: "No agents available." });
        return;
      }

      let text = "🧑 **Select Agent**\n\n";
      for (const agent of agents) {
        text += `• ${agent.name}\n`;
      }
      await bot.sendMessage(chatId, { text, format: "markdown" });
      await bot.answerCallback(callback.callback_id);
    }

    if (data.startsWith("agent_")) {
      const agentName = data.replace("agent_", "");
      agentManager.setCurrentAgent(agentName);
      await bot.sendMessage(chatId, { text: `✅ Agent set: ${agentName}` });
      await bot.answerCallback(callback.callback_id, `Agent: ${agentName}`);
    }

    if (data === "select_model") {
      const models = modelManager.getModels();
      if (models.length === 0) {
        await bot.sendMessage(chatId, { text: "No models available." });
        return;
      }

      let text = "🤖 **Select Model**\n\n";
      for (const model of models) {
        text += `• ${model.name} (${model.providerId})\n`;
      }
      await bot.sendMessage(chatId, { text, format: "markdown" });
      await bot.answerCallback(callback.callback_id);
    }

    if (data.startsWith("model_")) {
      const modelId = data.replace("model_", "");
      modelManager.setCurrentModel(modelId);
      await bot.sendMessage(chatId, { text: `✅ Model set: ${modelId}` });
      await bot.answerCallback(callback.callback_id, `Model: ${modelId}`);
    }

    if (data === "select_variant") {
      const variants = variantManager.getVariants();
      if (variants.length === 0) {
        await bot.sendMessage(chatId, { text: "No variants available." });
        return;
      }

      let text = "⚙️ **Select Variant**\n\n";
      for (const variant of variants) {
        text += `• ${variant.name}\n`;
      }
      await bot.sendMessage(chatId, { text, format: "markdown" });
      await bot.answerCallback(callback.callback_id);
    }

    if (data.startsWith("variant_")) {
      const variantId = data.replace("variant_", "");
      variantManager.setCurrentVariant(variantId);
      await bot.sendMessage(chatId, { text: `✅ Variant set: ${variantId}` });
      await bot.answerCallback(callback.callback_id, `Variant: ${variantId}`);
    }
  });
}
