import type { MaxBot, CallbackHandler } from "../bot.js";
import { questionManager } from "../../question/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { sessionManager } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { buildQuestionOptionsKeyboard } from "../utils/keyboard.js";

export async function replyToQuestion(chatId: number): Promise<void> {
  const active = questionManager.getActive(chatId);
  const requestID = questionManager.getRequestId(chatId);
  if (!active || !requestID) return;

  const result = await opencodeClient.question.reply({
    requestID,
    directory: sessionManager.getSessionDirectory(active.sessionId, chatId) ?? undefined,
    answers: questionManager.getAnswers(chatId),
  });

  if (result.error) throw result.error;
  questionManager.clear(chatId);
  interactionManager.clear(chatId);
}

export function registerQuestionCallback(bot: MaxBot): void {
  bot.callback(
    (data) => data.startsWith("q_option_") || data === "q_custom" || data === "q_next",
    async (userId, chatId, data, callback) => {
      if (!questionManager.isActive(chatId)) return;

      const current = questionManager.getCurrentQuestion(chatId);
      if (!current) return;

      if (data.startsWith("q_option_")) {
        const optionValue = data.replace("q_option_", "");
        questionManager.selectOption(chatId, questionManager.getCurrentIndex(chatId), optionValue);
        await bot.answerCallback(callback.callback_id, `Выбрано: ${optionValue}`);

        if (!current.multiple) {
          const selected =
            questionManager
              .getSelectedOptions(chatId)
              .get(questionManager.getCurrentIndex(chatId)) ?? [];
          if (selected.length > 0) {
            try {
              await replyToQuestion(chatId);
            } catch (error) {
              logger.error("[Question] Reply error:", error);
            }
          }
        }
      }

      if (data === "q_custom") {
        await bot.answerCallback(callback.callback_id);
        await bot.sendMessage(chatId, { text: "✏️ Type your answer:" });
      }

      if (data === "q_next") {
        await bot.answerCallback(callback.callback_id);
        if (questionManager.nextQuestion(chatId)) {
          const next = questionManager.getCurrentQuestion(chatId);
          if (next) {
            await bot.sendMessage(chatId, {
              text: `❓ **${next.header ?? "Question"}**\n\n${next.question}`,
              format: "markdown",
              attachments: [buildQuestionOptionsKeyboard(next.options, next.multiple)],
            });
          }
        } else {
          try {
            await replyToQuestion(chatId);
          } catch (error) {
            logger.error("[Question] Reply error:", error);
          }
        }
      }
    },
  );
}
