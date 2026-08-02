import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { sessionManager } from "../../session/manager.js";
import { settingsManager } from "../../settings/manager.js";
import { modelManager } from "../../model/manager.js";
import { agentManager } from "../../agent/manager.js";
import { logger } from "../../utils/logger.js";

export function registerStatusCommand(bot: MaxBot): void {
  bot.command("status", "Show current status", async (userId) => {
    try {
      const healthResult = await opencodeClient.global.health();
      const project = settingsManager.getCurrentProject();
      const session = sessionManager.getCurrentSession();
      const model = modelManager.getCurrentModel();
      const agent = agentManager.getCurrentAgent();

      const health = healthResult.data;

      let text = "📊 **Status**\n\n";
      text += `Server: ${health?.healthy ? "✅ Connected" : "❌ Disconnected"}\n`;

      if (project) {
        text += `📁 Project: ${project}\n`;
      }
      if (session) {
        text += `💬 Session: ${session}\n`;
      }
      if (model) {
        text += `🤖 Model: ${model}\n`;
      }
      if (agent) {
        text += `🧑 Agent: ${agent}\n`;
      }

      await bot.sendMessage(userId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[Status] Error:", error);
      await bot.sendMessage(userId, {
        text: "❌ Cannot connect to OpenCode server.",
        format: "markdown",
      });
    }
  });
}
