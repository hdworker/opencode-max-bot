import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { logger } from "../../utils/logger.js";

export function registerSessionsCommand(bot: MaxBot): void {
  bot.command("sessions", "List recent sessions", async (userId) => {
    try {
      const result = await opencodeClient.session.list();
      const sessions = result.data ?? [];

      if (sessions.length === 0) {
        await bot.sendMessage(userId, { text: "No sessions found." });
        return;
      }

      let text = "📋 **Recent Sessions**\n\n";
      const buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> = [];
      
      for (const session of sessions.slice(0, 10)) {
        const id = (session.id ?? "").slice(0, 8);
        const title = session.title ?? "Untitled";
        text += `• ${title} (${id})\n`;
        buttons.push([{
          type: "callback",
          text: `📁 ${title}`,
          payload: `select_session:${session.id}`,
        }]);
      }

      await bot.sendMessage(userId, {
        text,
        format: "markdown",
        attachments: [{
          type: "inline_keyboard",
          payload: { buttons },
        }],
      });
    } catch (error) {
      logger.error("[Sessions] Error:", error);
      await bot.sendMessage(userId, { text: "❌ Failed to list sessions." });
    }
  });
}
