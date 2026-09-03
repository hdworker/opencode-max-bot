import type { MaxBot } from "../bot.js";
import { interactionManager } from "../../interaction/manager.js";
import { modelManager, modelSelectionId } from "../../model/manager.js";
import { agentManager } from "../../agent/manager.js";
import { variantManager } from "../../variant/manager.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { buildSingleRowKeyboard } from "../utils/keyboard.js";

export function registerAgentCallback(bot: MaxBot): void {
  bot.callback(
    (data) =>
      data === "select_agent" ||
      data.startsWith("agent_") ||
      data === "select_model" ||
      data.startsWith("model_") ||
      data === "select_variant" ||
      data.startsWith("variant_"),
    async (userId, chatId, data, callback) => {
      if (data === "select_agent") {
        await bot.answerCallback(callback.callback_id, "⏳ Загружаю агентов…");
        await agentManager.loadAgents(chatId);
        const agents = agentManager
          .getAgents(chatId)
          .filter((agent) => /^(plan|build)$/i.test(agent.name));
        if (agents.length === 0) {
          await bot.sendMessage(chatId, { text: "Доступные агенты plan/build не найдены." });
          return;
        }

        await bot.sendMessage(chatId, {
          text: "🤖 **Выберите агента**",
          format: "markdown",
          attachments: [
            buildSingleRowKeyboard(
              agents
                .slice(0, 10)
                .map((agent) => ({ text: agent.name, payload: `agent_${agent.name}` })),
            ),
          ],
        });
      }

      if (data.startsWith("agent_")) {
        const agentName = data.replace("agent_", "");
        agentManager.setCurrentAgent(agentName, chatId);
        await bot.sendMessage(chatId, { text: `✅ Agent set: ${agentName}` });
        await bot.answerCallback(callback.callback_id, `Agent: ${agentName}`);
      }

      if (data === "select_model") {
        await bot.answerCallback(callback.callback_id, "⏳ Загружаю модели…");
        await modelManager.loadModels(chatId);
        const models = modelManager.getModels(chatId);
        if (models.length === 0) {
          await bot.sendMessage(chatId, { text: "No models available." });
          return;
        }

        await bot.sendMessage(chatId, {
          text: "💃 **Выберите модель**",
          format: "markdown",
          attachments: [
            buildSingleRowKeyboard(
              models.slice(0, 10).map((model) => ({
                text: `${model.name} (${model.providerId})`,
                payload: `model_${modelSelectionId(model)}`,
              })),
            ),
          ],
        });
      }

      if (data.startsWith("model_")) {
        const selectionId = data.replace("model_", "");
        modelManager.setCurrentModel(selectionId, chatId);
        const model = modelManager.getModelBySelectionId(selectionId, chatId);
        variantManager.setVariants(
          chatId,
          (model?.variants ?? []).map((variant) => ({ id: variant, name: variant })),
        );
        await bot.sendMessage(chatId, { text: `✅ Model set: ${selectionId}` });
        await bot.answerCallback(callback.callback_id, `Model: ${selectionId}`);
      }

      if (data === "select_variant") {
        await bot.answerCallback(callback.callback_id, "⏳ Загружаю варианты…");
        const variants = variantManager.getVariants(chatId);
        if (variants.length === 0) {
          await bot.sendMessage(chatId, { text: "No variants available." });
          return;
        }

        await bot.sendMessage(chatId, {
          text: "⚙️ **Выберите вариант**",
          format: "markdown",
          attachments: [
            buildSingleRowKeyboard(
              variants
                .slice(0, 10)
                .map((variant) => ({ text: variant.name, payload: `variant_${variant.id}` })),
            ),
          ],
        });
      }

      if (data.startsWith("variant_")) {
        const variantId = data.replace("variant_", "");
        variantManager.setCurrentVariant(chatId, variantId);
        await bot.sendMessage(chatId, { text: `✅ Variant set: ${variantId}` });
        await bot.answerCallback(callback.callback_id, `Variant: ${variantId}`);
      }
    },
  );
}
