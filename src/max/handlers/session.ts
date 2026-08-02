import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { settingsManager } from "../../settings/manager.js";
import { sessionManager } from "../../session/manager.js";

export function registerSessionSelectCallback(bot: MaxBot): void {
  bot.onCallback(async (userId, chatId, data, callback) => {
    if (!data.startsWith("select_session:")) return;

    const sessionId = data.replace("select_session:", "");
    
    logger.debug(`[SessionSelect] User ${userId} selected session: ${sessionId}`);

    try {
      sessionManager.setCurrentSession(sessionId);

      await bot.answerCallback(callback.callback_id, `✅ Session: ${sessionId.slice(0, 8)}`);
      await bot.sendMessage(userId, {
        text: `✅ **Session selected**\n\n${sessionId}`,
        format: "markdown",
      });

      logger.info(`[SessionSelect] Session set to: ${sessionId}`);
    } catch (error) {
      logger.error("[SessionSelect] Error:", error);
      await bot.answerCallback(callback.callback_id, "❌ Failed to select session");
    }
  });
}
