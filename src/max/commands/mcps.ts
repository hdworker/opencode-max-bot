import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";

export function registerMcpsCommand(bot: MaxBot): void {
  bot.command("mcps", "List MCP servers", async (userId) => {
    try {
      const result = await (opencodeClient as any).app.mcp?.status();
      const mcps = result?.data;

      const mcpList = mcps ? Object.entries(mcps).map(([name, info]) => ({
        name,
        ...(typeof info === "object" && info !== null ? info : {}),
      })) : [];

      if (mcpList.length === 0) {
        await bot.sendMessage(userId, { text: "No MCP servers configured." });
        return;
      }

      let text = "🔌 **MCP Servers**\n\n";
      for (const mcp of mcpList) {
        text += `• ${mcp.name}\n`;
      }

      await bot.sendMessage(userId, { text, format: "markdown" });
    } catch (error) {
      logger.error("[MCPs] Error:", error);
      await bot.sendMessage(userId, { text: "❌ Failed to list MCP servers." });
    }
  });
}
