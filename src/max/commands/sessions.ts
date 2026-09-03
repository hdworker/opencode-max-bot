import type { MaxBot } from "../bot.js";
import { sessionManager } from "../../session/manager.js";
import { logger } from "../../utils/logger.js";
import { projectManager } from "../../project/manager.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";

export function registerSessionsCommand(bot: MaxBot): void {
  const listSessions = async (userId: number, chatId: number): Promise<void> => {
    try {
      await projectManager.loadProjects();
      const directory = projectManager.getCurrentProjectDirectory(chatId);
      const sessions = await openCodeWorkspace.listSessions(directory);

      if (sessions.length === 0) {
        await bot.sendMessage(chatId, {
          text: "📭 Сессий пока нет. Создайте первую командой /new.",
        });
        return;
      }

      let text = "📋 **Recent Sessions**\n\n";
      const buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> = [];

      for (const session of sessions.slice(0, 10)) {
        const id = session.id.slice(0, 8);
        const title = session.title;
        text += `• ${title} (${id})\n`;
        buttons.push([
          {
            type: "callback",
            text: `📁 ${title}`,
            payload: `select_session:${session.id}`,
          },
        ]);
      }

      await bot.sendMessage(chatId, {
        text,
        format: "markdown",
        attachments: [
          {
            type: "inline_keyboard",
            payload: { buttons },
          },
        ],
      });
    } catch (error) {
      logger.error("[Sessions] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Не удалось получить список сессий." });
    }
  };

  bot.command("session", "List recent sessions", listSessions);
  bot.command("sessions", "List recent sessions", listSessions);
}
