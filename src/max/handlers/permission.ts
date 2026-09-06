import type { MaxBot } from "../bot.js";
import { permissionManager } from "../../permission/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { sessionManager } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { withTimeout } from "../../utils/with-timeout.js";

const PERMISSION_REPLY_TIMEOUT_MS = 30_000;

export function registerPermissionCallback(bot: MaxBot): void {
  bot.callback(
    (data) => data.startsWith("perm_allow_") || data.startsWith("perm_deny_"),
    async (userId, chatId, data, callback) => {
      if (data.startsWith("perm_allow_")) {
        await bot.answerCallback(callback.callback_id, "⏳ Разрешаю…");
        const id = data.replace("perm_allow_", "");
        const request = permissionManager.get(id);

        if (request && request.chatId === chatId) {
          try {
            const result = await withTimeout(
              opencodeClient.permission.reply({
                requestID: request.id,
                directory: sessionManager.getSessionDirectory(request.sessionId, chatId) ?? undefined,
                reply: "once",
              }),
              PERMISSION_REPLY_TIMEOUT_MS,
            );

            if (result.error) throw result.error;

            permissionManager.remove(id);
            if (interactionManager.getActive(chatId)?.requestId === id) {
              interactionManager.clear(chatId);
            }
            await bot.sendMessage(chatId, { text: "✅ Permission granted." });
          } catch (error) {
            logger.error("[Permission] Reply error:", error);
            await bot.sendMessage(chatId, { text: "❌ Failed to reply." });
          }
        } else {
          await bot.answerCallback(callback.callback_id, "Запрос разрешения уже не активен.");
        }
      }

      if (data.startsWith("perm_deny_")) {
        await bot.answerCallback(callback.callback_id, "⏳ Отклоняю…");
        const id = data.replace("perm_deny_", "");
        const request = permissionManager.get(id);

        if (request && request.chatId === chatId) {
          try {
            const result = await withTimeout(
              opencodeClient.permission.reply({
                requestID: request.id,
                directory: sessionManager.getSessionDirectory(request.sessionId, chatId) ?? undefined,
                reply: "reject",
              }),
              PERMISSION_REPLY_TIMEOUT_MS,
            );

            if (result.error) throw result.error;

            permissionManager.remove(id);
            if (interactionManager.getActive(chatId)?.requestId === id) {
              interactionManager.clear(chatId);
            }
            await bot.sendMessage(chatId, { text: "🛑 Permission denied." });
          } catch (error) {
            logger.error("[Permission] Reply error:", error);
            await bot.sendMessage(chatId, { text: "❌ Не удалось обработать разрешение. Повторите действие." });
          }
        } else {
          await bot.answerCallback(callback.callback_id, "Запрос разрешения уже не активен.");
        }
      }
    },
  );
}
