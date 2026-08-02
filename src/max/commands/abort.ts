import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { logger } from "../../utils/logger.js";

export function registerAbortCommand(bot: MaxBot): void {
  bot.command("abort", "Abort current session", async (userId, chatId) => {
    const session = sessionManager.getCurrentSession();
    if (!session) {
      await bot.sendMessage(chatId, { text: "No active session." });
      return;
    }

    try {
      const result = await opencodeClient.session.abort({
        path: { id: session },
      } as any);

      if (result.error) {
        throw result.error;
      }

      await bot.sendMessage(chatId, { text: "🛑 Session aborted." });
    } catch (error) {
      logger.error("[Abort] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to abort session." });
    }
  });
}
