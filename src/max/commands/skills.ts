import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";

export function registerSkillsCommand(bot: MaxBot): void {
  bot.command("skills", "List available skills", async (userId) => {
    try {
      const result = await opencodeClient.app.skills();
      const skills = result.data ?? [];

      if (skills.length === 0) {
        await bot.sendMessage(userId, { text: "No skills available." });
        return;
      }

      let text = "🛠 **Skills**\n\n";
      for (const skill of skills) {
        text += `• ${skill.name ?? "Unknown"}\n`;
      }

      await bot.sendMessage(userId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Skills] Error:", error);
      await bot.sendMessage(userId, { text: "❌ Failed to list skills." });
    }
  });
}
