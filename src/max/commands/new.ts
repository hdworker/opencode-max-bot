import type { MaxBot } from "../bot.js";
import { sessionManager } from "../../session/manager.js";
import { logger } from "../../utils/logger.js";
import { projectManager } from "../../project/manager.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";
import { buildSessionPanel } from "../utils/session-panel.js";

export function registerNewCommand(bot: MaxBot): void {
  bot.command("new", "Create a new session", async (userId, chatId, text, args) => {
    try {
      await projectManager.loadProjects();
      const directory = projectManager.getCurrentProjectDirectory(chatId);
      const session = await openCodeWorkspace.createSession(directory, args || undefined);

      const sessionId = session.id;
      sessionManager.setCurrentSession(chatId, sessionId, session.directory || directory);

      await bot.sendMessage(chatId, {
        text: `✅ New session created: ${sessionId.slice(0, 8)}`,
        format: "markdown",
        attachments: [buildSessionPanel()],
      });
    } catch (error) {
      logger.error("[New] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to create session." });
    }
  });
}
