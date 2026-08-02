import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { resolveLocalOpencodeTarget, findServerPid, killServerProcess } from "../../opencode/process.js";
import { config } from "../../config.js";

export function registerOpencodeStopCommand(bot: MaxBot): void {
  bot.command("opencode_stop", "Stop OpenCode server", async (userId, chatId) => {
    const localTarget = resolveLocalOpencodeTarget(config.opencode.apiUrl);
    if (!localTarget) {
      await bot.sendMessage(chatId, {
        text: "⚠️ /opencode_stop works only with local OpenCode server.\n\nSet OPENCODE_API_URL to localhost:4096",
        format: "markdown",
      });
      return;
    }

    try {
      const pid = await findServerPid(localTarget.port);
      if (!pid) {
        await bot.sendMessage(chatId, {
          text: "⚠️ OpenCode server is not running",
          format: "markdown",
        });
        return;
      }

      logger.info(`[OpencodeStop] Stopping server with PID ${pid}`);
      await bot.sendMessage(chatId, {
        text: `🛑 Stopping OpenCode server...\n\nPID: ${pid}`,
        format: "markdown",
      });

      const killed = await killServerProcess(pid, 5000);
      if (killed) {
        await bot.sendMessage(chatId, {
          text: `✅ OpenCode server stopped!\n\nPID: ${pid}`,
          format: "markdown",
        });
      } else {
        await bot.sendMessage(chatId, {
          text: `⚠️ Server is still running after stop request\n\nPID: ${pid}`,
          format: "markdown",
        });
      }
    } catch (error) {
      logger.error("[OpencodeStop] Failed to stop server", error);
      await bot.sendMessage(chatId, {
        text: `❌ Failed to stop OpenCode server\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
        format: "markdown",
      });
    }
  });
}
