import type { MaxBot } from "../bot.js";
import { permissionManager } from "../../permission/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { sessionManager } from "../../session/manager.js";

export function registerPermissionCallback(bot: MaxBot): void {
  bot.callback(
    (data) => data.startsWith("perm_allow_") || data.startsWith("perm_deny_"),
    async (userId, chatId, data, callback) => {
      if (data.startsWith("perm_allow_")) {
        await bot.answerCallback(callback.callback_id, "⏳ Разрешаю…");
        const id = data.replace("perm_allow_", "");
        const request = permissionManager.get(id);

        if (request) {
          try {
            const result = await opencodeClient.permission.reply({
              requestID: request.id,
              directory: sessionManager.getSessionDirectory(request.sessionId, chatId) ?? undefined,
              reply: "once",
            });

            if (result.error) throw result.error;

            await bot.sendMessage(chatId, { text: "✅ Permission granted." });
          } catch (error) {
            logger.error("[Permission] Reply error:", error);
            await bot.sendMessage(chatId, { text: "❌ Failed to reply." });
          }
          permissionManager.remove(id);
        }
      }

      if (data.startsWith("perm_deny_")) {
        await bot.answerCallback(callback.callback_id, "⏳ Отклоняю…");
        const id = data.replace("perm_deny_", "");
        const request = permissionManager.get(id);

        if (request) {
          try {
            const result = await opencodeClient.permission.reply({
              requestID: request.id,
              directory: sessionManager.getSessionDirectory(request.sessionId, chatId) ?? undefined,
              reply: "reject",
            });

            if (result.error) throw result.error;

            await bot.sendMessage(chatId, { text: "🛑 Permission denied." });
          } catch (error) {
            logger.error("[Permission] Reply error:", error);
          }
          permissionManager.remove(id);
        }
      }
    },
  );
}
