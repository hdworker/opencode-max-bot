import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import {
  resolveLocalOpencodeTarget,
  startLocalOpencodeServer,
  findServerPid,
  killServerProcess,
} from "../../opencode/process.js";
import { config } from "../../config.js";

export function registerOpencodeStartCommand(bot: MaxBot): void {
  bot.command("opencode_start", "Start OpenCode server", async (userId, chatId) => {
    const localTarget = resolveLocalOpencodeTarget(config.opencode.apiUrl);
    if (!localTarget) {
      await bot.sendMessage(chatId, {
        text: "⚠️ /opencode_start works only with local OpenCode server.\n\nSet OPENCODE_API_URL to localhost:4096",
        format: "markdown",
      });
      return;
    }

    logger.info(`[OpencodeStart] Starting local server on port ${localTarget.port}`);
    await bot.sendMessage(chatId, {
      text: `🔄 Starting OpenCode server on port ${localTarget.port}...`,
      format: "markdown",
    });

    try {
      const childProcess = startLocalOpencodeServer(localTarget);
      childProcess.once("error", (error) => {
        logger.error("[OpencodeStart] Server process failed to start", error);
      });

      const pid = childProcess.pid;
      childProcess.unref();

      logger.info(`[OpencodeStart] Server started with PID ${pid}`);
      await bot.sendMessage(chatId, {
        text: `✅ OpenCode server started!\n\nPID: ${pid}\nPort: ${localTarget.port}`,
        format: "markdown",
      });
    } catch (error) {
      logger.error("[OpencodeStart] Failed to start server", error);
      await bot.sendMessage(chatId, {
        text: `❌ Failed to start OpenCode server\n\nError: ${error instanceof Error ? error.message : "Unknown error"}`,
        format: "markdown",
      });
    }
  });
}
