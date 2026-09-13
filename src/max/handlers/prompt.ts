import type { MaxBot, MessageHandler } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { questionManager } from "../../question/manager.js";
import { modelManager } from "../../model/manager.js";
import { agentManager } from "../../agent/manager.js";
import { variantManager } from "../../variant/manager.js";
import { logger } from "../../utils/logger.js";
import { projectManager } from "../../project/manager.js";
import { chunkText, renderText } from "../render/pipeline.js";
import { startMaxEventSubscription } from "../event-handler.js";
import { buildQuestionOptionsKeyboard } from "../utils/keyboard.js";
import { replyToQuestion } from "./question.js";
import { buildSessionPanel } from "../utils/session-panel.js";
import { promptOperationManager } from "../prompt-operation.js";
import { withTimeout } from "../../utils/with-timeout.js";
import { clearChatWorkflowState } from "../../interaction/reset.js";
import {
  classifyMaxApiFailure,
  classifyPromptFailure,
  promptFailureMessage,
} from "../prompt-errors.js";
import { isPromptTooLong, MAX_PROMPT_LENGTH } from "../prompt-input.js";
import { isSessionContextTooLarge } from "../session-guard.js";

const PROMPT_TIMEOUT_MS = 15 * 60 * 1000;

const MAX_RESPONSE_LENGTH = 4000;

export function registerPromptHandler(bot: MaxBot): void {
  bot.onMessage(async (userId, chatId, text, message) => {
    if (!text || text.startsWith("/")) return;

    if (interactionManager.isActive(chatId)) {
      const active = interactionManager.getActive(chatId);

      if (active?.kind === "rename") {
        const session = sessionManager.getCurrentSession(chatId);
        if (session) {
          try {
            const result = await opencodeClient.session.update({
              sessionID: session,
              directory: sessionManager.getCurrentSessionDirectory(chatId) ?? undefined,
              title: text,
            });

            if (result.error) throw result.error;

            await bot.sendMessage(chatId, { text: `✅ Renamed to: ${text}` });
          } catch (error) {
            logger.error("[Rename] Error:", error);
            await bot.sendMessage(chatId, { text: "❌ Failed to rename session." });
          }
        }
        interactionManager.clear(chatId);
        return;
      }

      if (
        (active?.kind === "question" || active?.kind === "question_custom") &&
        questionManager.isActive(chatId)
      ) {
        await questionManager.runExclusive(chatId, async () => {
          const current = questionManager.getCurrentQuestion(chatId);
          if (!current || questionManager.getRequestId(chatId) !== active.requestId) return;

          questionManager.setCustomAnswer(chatId, questionManager.getCurrentIndex(chatId), text);
          if (questionManager.nextQuestion(chatId)) {
            interactionManager.clear(chatId);
            interactionManager.start(
              chatId,
              "question",
              active.sessionId,
              undefined,
              active.requestId,
            );
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
          } else {
            try {
              await replyToQuestion(chatId);
            } catch (error) {
              logger.error("[Question] Custom answer reply error:", error);
              await bot.sendMessage(chatId, {
                text: "❌ Failed to send the answer. Try again or use a command.",
                attachments: [
                  buildQuestionOptionsKeyboard(
                    current.options,
                    current.multiple,
                    questionManager.getRequestId(chatId) ?? "",
                    questionManager.getCurrentIndex(chatId),
                    current.custom,
                  ),
                ],
              });
              if (questionManager.getRequestId(chatId) === active.requestId) {
                interactionManager.clear(chatId);
                interactionManager.start(
                  chatId,
                  "question_custom",
                  active.sessionId,
                  undefined,
                  active.requestId,
                );
              }
            }
          }
        });
        return;
      }
    }

    let sessionId = sessionManager.getCurrentSession(chatId);
    await projectManager.loadProjects();
    const projectDirectory = projectManager.getCurrentProjectDirectory(chatId);
    let sessionDirectory = sessionManager.getCurrentSessionDirectory(chatId) ?? projectDirectory;

    if (!sessionId) {
      await bot.sendMessage(chatId, {
        text: "ℹ️ Сначала создайте или выберите сессию: /new или /sessions",
      });
      return;
    }

    if (!sessionId) return;

    if (isPromptTooLong(text)) {
      await safeSendMessage(bot, chatId, {
        text: `❌ Сообщение слишком длинное: ${text.length} символов. Максимум для одного prompt — ${MAX_PROMPT_LENGTH}. Разбейте его на несколько сообщений или создайте новую сессию.`,
      });
      return;
    }

    if (promptOperationManager.isSessionActive(sessionId)) {
      await safeSendMessage(bot, chatId, {
        text: "⏳ Эта сессия уже обрабатывает запрос. Дождитесь завершения или используйте /abort.",
      });
      return;
    }

    if (await isSessionContextTooLarge(sessionId, sessionDirectory)) {
      await safeSendMessage(bot, chatId, {
        text: "⚠️ В этой сессии уже накопился очень большой контекст. Создайте новую сессию через /new, чтобы избежать таймаута OpenCode.",
        attachments: [buildSessionPanel()],
      });
      return;
    }

    if (sessionDirectory) {
      startMaxEventSubscription(bot, chatId, sessionDirectory);
    }

    const promptController = promptOperationManager.start(chatId, sessionId);
    try {
      await safeSendMessage(bot, chatId, { text: "⏳ Processing..." });

      const model = modelManager.getCurrentModelInfo(chatId);
      const agent = agentManager.getCurrentAgent(chatId);

      const result = await withPromptTimeout(
        opencodeClient.session.prompt(
          {
            sessionID: sessionId,
            directory: sessionDirectory ?? undefined,
            parts: [{ type: "text", text }],
            model: model ? { providerID: model.providerId, modelID: model.id } : undefined,
            agent: agent ?? undefined,
            variant: variantManager.getCurrentVariant(chatId) ?? undefined,
          },
          { signal: promptController.signal },
        ),
        promptController,
      );

      if (result.error) throw result.error;

      const responseText =
        result.data?.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n\n")
          .trim() ?? "";

      if (!responseText) {
        await safeSendMessage(bot, chatId, {
          text: "✅ Done. Панель сессии:",
          attachments: [buildSessionPanel()],
        });
        return;
      }

      const chunks = chunkText(renderText(responseText), MAX_RESPONSE_LENGTH);
      for (const [index, chunk] of chunks.entries()) {
        await safeSendMessage(bot, chatId, {
          text: chunk,
          format: "markdown",
          ...(index === chunks.length - 1 ? { attachments: [buildSessionPanel()] } : {}),
        });
      }
    } catch (error) {
      if (promptController.signal.aborted) {
        if (promptOperationManager.isCurrent(chatId, promptController)) {
          clearChatWorkflowState(chatId);
        }
        if (promptController.signal.reason instanceof Error) {
          await safeSendMessage(bot, chatId, {
            text: promptFailureMessage("opencode-timeout"),
            attachments: [buildSessionPanel()],
          });
        }
        return;
      }
      const kind = classifyPromptFailure(error);
      logger.error(`[Prompt] ${kind}:`, error);
      clearChatWorkflowState(chatId);
      await safeSendMessage(bot, chatId, {
        text: promptFailureMessage(kind),
        attachments: [buildSessionPanel()],
      });
    } finally {
      promptOperationManager.clear(chatId, promptController);
    }
  });
}

async function safeSendMessage(
  bot: MaxBot,
  chatId: number,
  body: Parameters<MaxBot["sendMessage"]>[1],
): Promise<void> {
  try {
    await bot.sendMessage(chatId, body);
  } catch (error) {
    logger.error(`[Prompt] MAX status message failed (${classifyMaxApiFailure(error)}):`, error);
  }
}

async function withPromptTimeout<T>(promise: Promise<T>, controller: AbortController): Promise<T> {
  return withTimeout(promise, PROMPT_TIMEOUT_MS, () =>
    controller.abort(new Error("Prompt timeout")),
  );
}
