import type { MaxBot } from "../bot.js";
import { permissionManager, type PermissionRequest } from "../../permission/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { sessionManager } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { withTimeout } from "../../utils/with-timeout.js";

const PERMISSION_REPLY_TIMEOUT_MS = 30_000;
const inFlight = new Set<string>();

type PermissionReply = "once" | "always" | "reject";

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    _tag?: unknown;
    name?: unknown;
    message?: unknown;
    data?: { message?: unknown };
  };
  return (
    candidate._tag === "PermissionNotFoundError" ||
    candidate.name === "NotFoundError" ||
    [candidate.message, candidate.data?.message].some(
      (message) =>
        typeof message === "string" &&
        message.toLowerCase().includes("permission") &&
        message.toLowerCase().includes("not found"),
    )
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "неизвестная ошибка";
}

export function registerPermissionCallback(bot: MaxBot): void {
  bot.callback(
    (data) =>
      data.startsWith("perm_allow_") ||
      data.startsWith("perm_always_") ||
      data.startsWith("perm_deny_"),
    async (_userId, chatId, data, callback) => {
      const action: PermissionReply = data.startsWith("perm_always_")
        ? "always"
        : data.startsWith("perm_allow_")
          ? "once"
          : "reject";
      const prefix =
        action === "always" ? "perm_always_" : action === "once" ? "perm_allow_" : "perm_deny_";
      const requestId = data.slice(prefix.length);
      const request = permissionManager.get(requestId);

      if (!request || request.chatId !== chatId) {
        await bot.answerCallback(callback.callback_id, "Запрос разрешения уже не активен.");
        return;
      }

      if (inFlight.has(requestId)) {
        await bot.answerCallback(callback.callback_id, "⏳ Уже обрабатываю…");
        return;
      }

      inFlight.add(requestId);
      await bot.answerCallback(
        callback.callback_id,
        action === "always"
          ? "⏳ Запоминаю разрешение…"
          : action === "once"
            ? "⏳ Разрешаю…"
            : "⏳ Отклоняю…",
      );

      try {
        const related = permissionManager.getRelated(request);
        const failed: Array<{ request: PermissionRequest; error: unknown }> = [];
        let processed = 0;

        for (const relatedRequest of related) {
          try {
            const result = await withTimeout(
              opencodeClient.permission.reply({
                requestID: relatedRequest.id,
                directory:
                  relatedRequest.directory ??
                  sessionManager.getSessionDirectory(relatedRequest.sessionId, chatId) ??
                  undefined,
                reply: action,
              }),
              PERMISSION_REPLY_TIMEOUT_MS,
            );

            if (result.error) throw result.error;
            permissionManager.remove(relatedRequest.id);
            processed++;
          } catch (error) {
            if (isNotFoundError(error)) {
              permissionManager.remove(relatedRequest.id);
              processed++;
            } else {
              failed.push({ request: relatedRequest, error });
            }
          }
        }

        if (failed.length > 0) {
          logger.error("[Permission] Reply failed", failed[0]?.error);
          await bot.sendMessage(chatId, {
            text: `❌ Не удалось обработать ${failed.length} запрос(а/ов) разрешения: ${getErrorMessage(failed[0]?.error)}\nПовторите действие.`,
          });
          return;
        }

        const activeRequestId = interactionManager.getActive(chatId)?.requestId;
        if (activeRequestId && related.some((item) => item.id === activeRequestId)) {
          interactionManager.clear(chatId);
        }
        await bot.sendMessage(chatId, {
          text:
            action === "reject"
              ? `🛑 Permission denied (${processed}).`
              : action === "always"
                ? `♾️ Permission always allowed (${processed}).`
                : `✅ Permission granted (${processed}).`,
        });
      } finally {
        inFlight.delete(requestId);
      }
    },
  );
}
