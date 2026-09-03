import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { logger } from "../../utils/logger.js";

export function registerRenameCommand(bot: MaxBot): void {
  bot.command("rename", "Rename current session", async (userId, chatId, text, args) => {
    if (!sessionManager.hasActiveSession(chatId)) {
      await bot.sendMessage(chatId, { text: "No active session to rename." });
      return;
    }

    if (args) {
      try {
        const session = sessionManager.getCurrentSession(chatId);
        if (session) {
          const result = await opencodeClient.session.update({
            sessionID: session,
            directory: sessionManager.getCurrentSessionDirectory(chatId) ?? undefined,
            title: args,
          });

          if (result.error) throw result.error;

          await bot.sendMessage(chatId, { text: `✅ Renamed to: ${args}` });
        }
      } catch (error) {
        logger.error("[Rename] Error:", error);
        await bot.sendMessage(chatId, { text: "❌ Failed to rename session." });
      }
      return;
    }

    interactionManager.start(chatId, "rename", sessionManager.getCurrentSession(chatId) ?? "");
    await bot.sendMessage(chatId, { text: "✏️ Send the new session name:" });
  });
}
