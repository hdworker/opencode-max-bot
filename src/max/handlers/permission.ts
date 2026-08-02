import type { MaxBot } from "../bot.js";
import { permissionManager } from "../../permission/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";

export function registerPermissionCallback(bot: MaxBot): void {
  bot.onCallback(async (userId, chatId, data, callback) => {
    if (data.startsWith("perm_allow_")) {
      const id = data.replace("perm_allow_", "");
      const request = permissionManager.get(id);

      if (request) {
        try {
          const result = await opencodeClient.question.reply({
            body: {
              requestID: request.id,
              answers: [["once"]],
            },
          } as any);

          if (result.error) throw result.error;

          await bot.sendMessage(chatId, { text: "✅ Permission granted." });
        } catch (error) {
          logger.error("[Permission] Reply error:", error);
          await bot.sendMessage(chatId, { text: "❌ Failed to reply." });
        }
        permissionManager.remove(id);
      }

      await bot.answerCallback(callback.callback_id, "Allowed");
    }

    if (data.startsWith("perm_deny_")) {
      const id = data.replace("perm_deny_", "");
      const request = permissionManager.get(id);

      if (request) {
        try {
          const result = await opencodeClient.question.reply({
            body: {
              requestID: request.id,
              answers: [["reject"]],
            },
          } as any);

          if (result.error) throw result.error;

          await bot.sendMessage(chatId, { text: "🛑 Permission denied." });
        } catch (error) {
          logger.error("[Permission] Reply error:", error);
        }
        permissionManager.remove(id);
      }

      await bot.answerCallback(callback.callback_id, "Denied");
    }
  });
}
