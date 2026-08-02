import type { MaxBot, MessageHandler } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { questionManager } from "../../question/manager.js";
import { modelManager } from "../../model/manager.js";
import { agentManager } from "../../agent/manager.js";
import { logger } from "../../utils/logger.js";

export function registerPromptHandler(bot: MaxBot): void {
  bot.onMessage(async (userId, chatId, text, message) => {
    if (!text || text.startsWith("/")) return;

    if (interactionManager.isActive()) {
      const active = interactionManager.getActive();

      if (active?.kind === "rename") {
        const session = sessionManager.getCurrentSession();
        if (session) {
          try {
            const result = await opencodeClient.session.update({
              path: { id: session },
              body: { title: text },
            } as any);

            if (result.error) throw result.error;

            await bot.sendMessage(chatId, { text: `✅ Renamed to: ${text}` });
          } catch (error) {
            logger.error("[Rename] Error:", error);
            await bot.sendMessage(chatId, { text: "❌ Failed to rename session." });
          }
        }
        interactionManager.clear();
        return;
      }

      if (active?.kind === "question" && questionManager.isActive()) {
        const current = questionManager.getCurrentQuestion();
        if (current) {
          questionManager.setCustomAnswer(0, text);
          questionManager.nextQuestion();
        }
        return;
      }
    }

    let sessionId = sessionManager.getCurrentSession();
    if (!sessionId) {
      try {
        const result = await opencodeClient.session.create({
          body: { title: text.slice(0, 50) },
        } as any);

        const session = result.data;
        if (!session) throw result.error ?? new Error("Failed to create session");

        sessionId = session.id ?? "";
        sessionManager.setCurrentSession(sessionId);
      } catch (error) {
        logger.error("[Prompt] Failed to create session:", error);
        await bot.sendMessage(chatId, { text: "❌ Failed to create session." });
        return;
      }
    }

    if (!sessionId) return;

    try {
      await bot.sendMessage(chatId, { text: "⏳ Processing..." });

      const model = modelManager.getCurrentModel();
      const agent = agentManager.getCurrentAgent();

      const promptBody: Record<string, unknown> = {
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
        },
      };

      if (model) {
        (promptBody.body as any).model = { providerID: "", modelID: model };
      }
      if (agent) {
        (promptBody.body as any).agent = agent;
      }

      const result = await opencodeClient.session.prompt(promptBody as any);

      if (result.error) throw result.error;
    } catch (error) {
      logger.error("[Prompt] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to send prompt." });
    }
  });
}
