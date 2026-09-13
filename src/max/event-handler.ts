import type { Event } from "@opencode-ai/sdk/v2";
import type { MaxBot } from "./bot.js";
import { interactionManager } from "../interaction/manager.js";
import { permissionManager } from "../permission/manager.js";
import { questionManager, type Question } from "../question/manager.js";
import { OpenCodeEventListener } from "../opencode/events.js";
import { buildConfirmationKeyboard, buildQuestionOptionsKeyboard } from "./utils/keyboard.js";
import { logger } from "../utils/logger.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { sessionManager } from "../session/manager.js";
import { promptOperationManager } from "./prompt-operation.js";
import { chunkText, renderText } from "./render/pipeline.js";
import { buildSessionPanel } from "./utils/session-panel.js";
import { withTimeout } from "../utils/with-timeout.js";
import { opencodeClient } from "../opencode/client.js";
import { clearChatWorkflowState } from "../interaction/reset.js";

const FINAL_MESSAGE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_LENGTH = 4000;

const listenersByChat = new Map<number, OpenCodeEventListener>();

function questionText(question: Question): string {
  let text = `❓ ${question.question}`;

  if (question.header) {
    text = `❓ **${question.header}**\n\n${question.question}`;
  }

  return text;
}

async function handleEvent(bot: MaxBot, chatId: number, event: Event): Promise<void> {
  switch (event.type) {
    case "session.idle": {
      const operation = promptOperationManager.completeBySession(event.properties.sessionID, chatId);
      if (!operation) return;

      try {
        const result = await withTimeout(
          opencodeClient.session.messages({
            sessionID: operation.sessionId,
            directory: operation.directory,
            limit: 100,
          }),
          FINAL_MESSAGE_TIMEOUT_MS,
        );
        if (result.error) throw result.error;

        const responseText = getLatestAssistantText(result.data);
        if (!responseText) {
          await safeSendMessage(bot, chatId, {
            text: "✅ Готово. Панель сессии:",
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
        logger.error("[OpenCodeEvents] Failed to read completed session response:", error);
        await safeSendMessage(bot, chatId, {
          text: "⚠️ OpenCode завершил работу, но итоговый ответ не удалось получить. Откройте сессию и повторите запрос при необходимости.",
          attachments: [buildSessionPanel()],
        });
      }
      clearChatWorkflowState(chatId);
      return;
    }

    case "permission.asked": {
      const request = event.properties;
      if (sessionManager.getCurrentSession(chatId) !== request.sessionID) return;
      permissionManager.add({
        id: request.id,
        chatId,
        sessionId: request.sessionID,
        message: request.permission,
        patterns: request.patterns,
        directory: sessionManager.getCurrentSessionDirectory(chatId) ?? undefined,
      });

      const activeInteraction = interactionManager.isActive(chatId)
        ? interactionManager.getActive(chatId)
        : null;
      if (!activeInteraction) {
        interactionManager.start(chatId, "permission", request.sessionID, undefined, request.id);
      }
      await bot.sendMessage(chatId, {
        text: `🔐 **Permission required**\n\n${request.permission}`,
        format: "markdown",
        attachments: [
          buildConfirmationKeyboard(
            `perm_allow_${request.id}`,
            `perm_deny_${request.id}`,
            `perm_always_${request.id}`,
          ),
        ],
      });
      return;
    }

    case "question.asked": {
      const request = event.properties;
      if (sessionManager.getCurrentSession(chatId) !== request.sessionID) return;
      const questions: Question[] = request.questions.map((question, index) => ({
        questionId: `${request.id}:${index}`,
        question: question.question,
        header: question.header,
        options: question.options.map((option) => ({
          label: option.label,
          description: option.description,
          value: option.label,
        })),
        multiple: question.multiple ?? false,
        custom: question.custom,
      }));

      if (questions.length === 0) {
        logger.warn(`[OpenCodeEvents] Empty question request: ${request.id}`);
        return;
      }

      const activeQuestion = questionManager.getActive(chatId);
      if (activeQuestion?.requestID === request.id) {
        logger.debug(`[OpenCodeEvents] Ignoring duplicate question request: ${request.id}`);
        return;
      }
      if (activeQuestion) {
        logger.error(
          `[OpenCodeEvents] Refusing to overwrite active question ${activeQuestion.requestID} with ${request.id}`,
        );
        await bot.sendMessage(chatId, {
          text: "⚠️ Уже есть активный вопрос OpenCode. Завершите его перед новым запросом.",
        });
        return;
      }

      questionManager.start(chatId, questions, request.id, request.sessionID);
      interactionManager.clear(chatId);
      interactionManager.start(chatId, "question", request.sessionID, undefined, request.id);

      const current = questionManager.getCurrentQuestion(chatId);
      if (current) {
        await bot.sendMessage(chatId, {
          text: questionText(current),
          format: "markdown",
          attachments: [
            buildQuestionOptionsKeyboard(
              current.options,
              current.multiple,
              request.id,
              questionManager.getCurrentIndex(chatId),
              current.custom,
            ),
          ],
        });
      }
      return;
    }

    case "session.error": {
      if (
        event.properties.sessionID &&
        sessionManager.getCurrentSession(chatId) !== event.properties.sessionID
      ) {
        return;
      }
      const error = event.properties.error;
      logger.error("[OpenCodeEvents] Session error", error);
      promptOperationManager.completeBySession(event.properties.sessionID ?? "", chatId);
      clearChatWorkflowState(chatId);
      await safeSendMessage(bot, chatId, {
        text: `❌ OpenCode error: ${getErrorMessage(error)}`,
      });
      return;
    }
  }
}

export function getLatestAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const assistants = messages.filter(
    (message): message is {
      type: "assistant";
      time?: { created?: number };
      content?: Array<{ type?: string; text?: string }>;
    } =>
      typeof message === "object" &&
      message !== null &&
      (message as { type?: unknown }).type === "assistant",
  );
  const latest = assistants.sort(
    (left, right) => (left.time?.created ?? 0) - (right.time?.created ?? 0),
  ).at(-1);
  return (
    latest?.content
      ?.filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n\n")
      .trim() ?? ""
  );
}

async function safeSendMessage(
  bot: MaxBot,
  chatId: number,
  body: Parameters<MaxBot["sendMessage"]>[1],
): Promise<void> {
  try {
    await bot.sendMessage(chatId, body);
  } catch (error) {
    logger.error("[OpenCodeEvents] Failed to send MAX event message:", error);
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = data.message;
      if (typeof message === "string") return message;
    }
  }

  return "Unknown error";
}

export function startMaxEventSubscription(bot: MaxBot, chatId: number, directory: string): void {
  listenersByChat.get(chatId)?.stop();
  const listener = new OpenCodeEventListener();
  listenersByChat.set(chatId, listener);

  safeBackgroundTask({
    taskName: "opencode.events",
    task: () =>
      listener.start(directory, (event) => {
        return handleEvent(bot, chatId, event).catch((error) => {
          logger.error("[OpenCodeEvents] Failed to handle event:", error);
        });
      }),
  });
}

export function stopMaxEventSubscription(): void {
  for (const listener of listenersByChat.values()) listener.stop();
  listenersByChat.clear();
  logger.info("OpenCode event listeners stopped");
}
