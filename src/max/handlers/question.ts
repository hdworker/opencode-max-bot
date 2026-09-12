import type { MaxBot, CallbackHandler } from "../bot.js";
import { questionManager } from "../../question/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { sessionManager } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { buildQuestionOptionsKeyboard } from "../utils/keyboard.js";
import { withTimeout } from "../../utils/with-timeout.js";

const QUESTION_REPLY_TIMEOUT_MS = 30_000;

type QuestionCallback =
  | { kind: "option"; requestId: string; index: number; value: string }
  | { kind: "custom" | "next"; requestId: string; index: number };

function parseQuestionCallback(data: string): QuestionCallback | null {
  try {
    const parts = data.split(":");
    if (parts.length < 3) return null;

    const kind = parts[0];
    const requestId = decodeURIComponent(parts[1]);
    const index = Number(parts[2]);
    if (!requestId || !Number.isInteger(index) || index < 0) return null;

    if (kind === "q_option" && parts.length === 4) {
      return { kind: "option", requestId, index, value: decodeURIComponent(parts[3]) };
    }
    if (kind === "q_custom" || kind === "q_next") {
      return { kind: kind === "q_custom" ? "custom" : "next", requestId, index };
    }
  } catch {
    return null;
  }
  return null;
}

export async function replyToQuestion(chatId: number): Promise<void> {
  const active = questionManager.getActive(chatId);
  const requestID = questionManager.getRequestId(chatId);
  if (!active || !requestID) return;

  const controller = new AbortController();
  const result = await withTimeout(
    opencodeClient.question.reply(
      {
        requestID,
        directory: sessionManager.getSessionDirectory(active.sessionId, chatId) ?? undefined,
        answers: questionManager.getAnswers(chatId),
      },
      { signal: controller.signal },
    ),
    QUESTION_REPLY_TIMEOUT_MS,
    () => controller.abort(),
  );

  if (result.error) throw result.error;
  questionManager.clear(chatId);
  interactionManager.clear(chatId);
}

export function registerQuestionCallback(bot: MaxBot): void {
  bot.callback(
    (data) => data.startsWith("q_option:") || data.startsWith("q_custom:") || data.startsWith("q_next:"),
    async (userId, chatId, data, callback) => {
      const action = parseQuestionCallback(data);
      if (!questionManager.isActive(chatId)) {
        await bot.answerCallback(callback.callback_id, "Вопрос больше не активен.");
        return;
      }
      if (!action || action.requestId !== questionManager.getRequestId(chatId)) {
        await bot.answerCallback(callback.callback_id, "Этот вопрос уже устарел.");
        return;
      }

      const current = questionManager.getCurrentQuestion(chatId);
      if (!current || action.index !== questionManager.getCurrentIndex(chatId)) {
        await bot.answerCallback(callback.callback_id, "Этот вопрос уже устарел.");
        return;
      }

      if (action.kind === "option") {
        questionManager.selectOption(chatId, action.index, action.value);
        await bot.answerCallback(callback.callback_id, `Выбрано: ${action.value}`);

        if (!current.multiple) {
          const selected = questionManager.getSelectedOptions(chatId).get(action.index) ?? [];
          if (selected.length > 0 && questionManager.nextQuestion(chatId)) {
            const next = questionManager.getCurrentQuestion(chatId);
            if (next) {
              await bot.sendMessage(chatId, {
                text: `❓ **${next.header ?? "Question"}**\n\n${next.question}`,
                format: "markdown",
                attachments: [
                  buildQuestionOptionsKeyboard(
                    next.options,
                    next.multiple,
                    questionManager.getRequestId(chatId) ?? "",
                    questionManager.getCurrentIndex(chatId),
                    next.custom,
                  ),
                ],
              });
            }
          } else if (selected.length > 0) {
            try {
              await replyToQuestion(chatId);
            } catch (error) {
              logger.error("[Question] Reply error:", error);
              await bot.sendMessage(chatId, { text: "❌ Не удалось отправить ответ. Повторите выбор." });
            }
          }
        }
      }

      if (action.kind === "custom") {
        await bot.answerCallback(callback.callback_id);
        interactionManager.clear(chatId);
        interactionManager.start(
          chatId,
          "question_custom",
          questionManager.getActive(chatId)?.sessionId ?? "",
          undefined,
          action.requestId,
        );
        await bot.sendMessage(chatId, { text: "✏️ Type your answer:" });
      }

      if (action.kind === "next") {
        await bot.answerCallback(callback.callback_id);
        if (questionManager.nextQuestion(chatId)) {
          const next = questionManager.getCurrentQuestion(chatId);
          if (next) {
            interactionManager.clear(chatId);
            interactionManager.start(chatId, "question", questionManager.getActive(chatId)?.sessionId ?? "", undefined, action.requestId);
            await bot.sendMessage(chatId, {
              text: `❓ **${next.header ?? "Question"}**\n\n${next.question}`,
              format: "markdown",
              attachments: [
                buildQuestionOptionsKeyboard(
                  next.options,
                  next.multiple,
                  action.requestId,
                  questionManager.getCurrentIndex(chatId),
                  next.custom,
                ),
              ],
            });
          }
        } else {
          try {
            await replyToQuestion(chatId);
          } catch (error) {
            logger.error("[Question] Reply error:", error);
            await bot.sendMessage(chatId, { text: "❌ Не удалось отправить ответы. Повторите действие." });
          }
        }
      }
    },
  );
}
