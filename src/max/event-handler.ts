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
const FINAL_MESSAGE_RETRIES = 2;
const FINAL_MESSAGE_RETRY_DELAY_MS = 1_000;

const listenersByChat = new Map<number, OpenCodeEventListener>();

function questionText(question: Question): string {
  let text = `❓ ${question.question}`;

  if (question.header) {
    text = `❓ **${question.header}**\n\n${question.question}`;
  }

  return text;
}

export async function handleEvent(bot: MaxBot, chatId: number, event: Event): Promise<void> {
  switch (event.type) {
    case "session.idle": {
      const operation = promptOperationManager.beginFinalization(event.properties.sessionID, chatId);
      if (!operation) return;

      try {
        const messages = await readCompletedSessionMessages(operation);

        const responseText = getLatestAssistantText(messages);
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
      finally {
        promptOperationManager.clear(chatId, operation.controller);
        clearCompletedWorkflow(chatId, operation.sessionId);
      }
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

async function readCompletedSessionMessages(operation: {
  sessionId: string;
  directory?: string;
}): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FINAL_MESSAGE_RETRIES; attempt++) {
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
      return result.data;
    } catch (error) {
      lastError = error;
      if (attempt < FINAL_MESSAGE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, FINAL_MESSAGE_RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

function clearCompletedWorkflow(chatId: number, sessionId: string): void {
  if (interactionManager.getActive(chatId)?.sessionId === sessionId) {
    interactionManager.clear(chatId);
  }
  if (questionManager.getActive(chatId)?.sessionId === sessionId) {
    questionManager.clear(chatId);
  }
  permissionManager.clearForSession(chatId, sessionId);
}

export function getLatestAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const assistants = messages.filter((message) => {
    const info = getMessageInfo(message);
    return info?.type === "assistant" || info?.role === "assistant";
  });
  const latest = assistants.sort(
    (left, right) => getMessageCreatedAt(left) - getMessageCreatedAt(right),
  ).at(-1);

  return getTextParts(latest).join("\n\n").trim();
}

type MessageRecord = Record<string, unknown>;

function getMessageInfo(message: unknown): MessageRecord | null {
  if (typeof message !== "object" || message === null) return null;
  const record = message as MessageRecord;
  if (typeof record.info === "object" && record.info !== null) {
    return record.info as MessageRecord;
  }
  return record;
}

function getMessageCreatedAt(message: unknown): number {
  const info = getMessageInfo(message);
  const time = info?.time;
  if (typeof time === "object" && time !== null) {
    const created = (time as MessageRecord).created;
    if (typeof created === "number") return created;
  }
  return 0;
}

function getTextParts(message: unknown): string[] {
  if (typeof message !== "object" || message === null) return [];
  const record = message as MessageRecord;
  const info = getMessageInfo(message);
  const parts = Array.isArray(record.parts)
    ? record.parts
    : Array.isArray(record.content)
      ? record.content
      : Array.isArray(info?.content)
        ? info.content
        : [];

  return parts
    .filter((part): part is MessageRecord => typeof part === "object" && part !== null)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string);
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
      listener.start(
        directory,
        (event) => {
          return handleEvent(bot, chatId, event).catch((error) => {
            logger.error("[OpenCodeEvents] Failed to handle event:", error);
          });
        },
        () => reconcileActiveSessions(bot, chatId, directory),
      ),
  });
}

async function reconcileActiveSessions(bot: MaxBot, chatId: number, directory: string): Promise<void> {
  const operations = promptOperationManager.getByDirectory(directory);
  if (operations.length === 0) return;

  try {
    const result = await withTimeout(opencodeClient.session.status({ directory }), 2_000);
    if (result.error) throw result.error;
    for (const operation of operations) {
      if (result.data[operation.sessionId]?.type === "idle") {
        await handleEvent(bot, chatId, {
          id: `reconciled:${operation.sessionId}`,
          type: "session.idle",
          properties: { sessionID: operation.sessionId },
        });
      }
    }
  } catch (error) {
    logger.warn("[OpenCodeEvents] Failed to reconcile sessions after reconnect:", error);
  }
}

export function stopMaxEventSubscription(): void {
  for (const listener of listenersByChat.values()) listener.stop();
  listenersByChat.clear();
  logger.info("OpenCode event listeners stopped");
}
