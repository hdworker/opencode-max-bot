import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";
import { projectManager } from "../../project/manager.js";

export function registerMcpsCommand(bot: MaxBot): void {
  bot.command("mcps", "List MCP servers", async (userId, chatId) => {
    try {
      const mcpList = await openCodeWorkspace.listMcps(
        projectManager.getCurrentProjectDirectory(chatId),
      );

      if (mcpList.length === 0) {
        await bot.sendMessage(chatId, { text: "No MCP servers configured." });
        return;
      }

      let text = "🔌 **MCP Servers**\n\n";
      for (const mcp of mcpList) {
        text += `• ${mcp}\n`;
      }

      await bot.sendMessage(chatId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[MCPs] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to list MCP servers." });
    }
  });
}
