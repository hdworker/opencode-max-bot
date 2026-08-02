import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { subscribeToEvents } from "../../opencode/events.js";
import { logger } from "../../utils/logger.js";

export function registerNewCommand(bot: MaxBot): void {
  bot.command("new", "Create a new session", async (userId, chatId, text, args) => {
    try {
      const result = await opencodeClient.session.create({
        body: { title: args || undefined },
      } as any);

      const session = result.data;
      if (!session) {
        throw result.error ?? new Error("Failed to create session");
      }

      const sessionId = session.id ?? "";
      sessionManager.setCurrentSession(sessionId);

      await bot.sendMessage(chatId, {
        text: `✅ New session created: ${sessionId.slice(0, 8)}`,
        format: "markdown",
      });
    } catch (error) {
      logger.error("[New] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to create session." });
    }
  });
}
