import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { projectManager } from "../../project/manager.js";

export function registerSkillsCommand(bot: MaxBot): void {
  bot.command("skills", "List available skills", async (userId, chatId) => {
    try {
      const result = await opencodeClient.app.skills({
        directory: projectManager.getCurrentProjectDirectory(chatId),
      });
      const skills = result.data ?? [];

      if (skills.length === 0) {
        await bot.sendMessage(chatId, { text: "No skills available." });
        return;
      }

      let text = "🛠 **Skills**\n\n";
      for (const skill of skills) {
        text += `• ${skill.name ?? "Unknown"}\n`;
      }

      await bot.sendMessage(chatId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Skills] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to list skills." });
    }
  });
}
