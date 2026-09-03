import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";

export function registerStartCommand(bot: MaxBot): void {
  bot.command("start", "Start the bot", async (userId, chatId) => {
    try {
      const project = settingsManager.getCurrentProject();
      const session = sessionManager.getCurrentSession(chatId);

      let text = "🤖 **OpenCode MAX Bot**\n\n";
      text += "Ready to help with coding tasks.\n\n";

      if (project) {
        text += `📁 Project: ${project}\n`;
      }
      if (session) {
        text += `💬 Session: ${session}\n`;
      }

      text += "\nType /help to see available commands.";

      await bot.sendMessage(chatId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Start] Error:", error);
      await bot.sendMessage(chatId, { text: "Error initializing bot." });
    }
  });
}
