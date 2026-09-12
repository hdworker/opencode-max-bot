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
      await bot.sendMessage(chatId, {
        text: `❌ OpenCode error: ${getErrorMessage(error)}`,
      });
      return;
    }
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
        void handleEvent(bot, chatId, event).catch((error) => {
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
