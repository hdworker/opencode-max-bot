import fs from "node:fs/promises";
import { readFile } from "node:fs/promises";

import { createBot } from "../max/bot.js";
import { config } from "../config.js";
import { opencodeAutoRestartService } from "../opencode/auto-restart.js";
import { settingsManager } from "../settings/manager.js";
import { getRuntimeMode } from "../runtime/mode.js";
import { getRuntimePaths } from "../runtime/paths.js";
import { initializeLogger, logger } from "../utils/logger.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";

// Command registrations
import { registerStartCommand } from "../max/commands/start.js";
import { registerHelpCommand } from "../max/commands/help.js";
import { registerStatusCommand } from "../max/commands/status.js";
import { registerNewCommand } from "../max/commands/new.js";
import { registerAbortCommand } from "../max/commands/abort.js";
import { registerSessionsCommand } from "../max/commands/sessions.js";
import { registerProjectsCommand, registerProjectSelectCallback } from "../max/commands/projects.js";
import { registerRenameCommand } from "../max/commands/rename.js";
import { registerDetachCommand } from "../max/commands/detach.js";
import { registerTtsCommand } from "../max/commands/tts.js";
import { registerTaskCommand } from "../max/commands/task.js";
import { registerTasklistCommand } from "../max/commands/tasklist.js";
import { registerCommandsCommand } from "../max/commands/commands.js";
import { registerSkillsCommand } from "../max/commands/skills.js";
import { registerMcpsCommand } from "../max/commands/mcps.js";
import { registerModelsCommand } from "../max/commands/models.js";
import { registerOpencodeStartCommand } from "../max/commands/opencode-start.js";
import { registerOpencodeStopCommand } from "../max/commands/opencode-stop.js";

// Handler registrations
import { registerPromptHandler } from "../max/handlers/prompt.js";
import { registerQuestionCallback } from "../max/handlers/question.js";
import { registerPermissionCallback } from "../max/handlers/permission.js";
import { registerAgentCallback } from "../max/handlers/model.js";
import { registerSessionSelectCallback } from "../max/handlers/session.js";

const SHUTDOWN_TIMEOUT_MS = 5000;

async function getBotVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };

    return packageJson.version ?? "unknown";
  } catch (error) {
    logger.warn("[App] Failed to read bot version", error);
    return "unknown";
  }
}

export async function startBotApp(): Promise<void> {
  await initializeLogger();

  const mode = getRuntimeMode();
  const runtimePaths = getRuntimePaths();
  const version = await getBotVersion();

  logger.info(`Starting OpenCode MAX Bot v${version}...`);
  logger.info(`Config loaded from ${runtimePaths.envFilePath}`);
  logger.info(`Allowed User ID: ${config.max.allowedUserId}`);
  logger.debug(`[Runtime] Application start mode: ${mode}`);

  await settingsManager.init(true);

  const bot = createBot();

  // Register commands
  registerStartCommand(bot);
  registerHelpCommand(bot);
  registerStatusCommand(bot);
  registerNewCommand(bot);
  registerAbortCommand(bot);
  registerSessionsCommand(bot);
  registerProjectsCommand(bot);
  registerRenameCommand(bot);
  registerDetachCommand(bot);
  registerTtsCommand(bot);
  registerTaskCommand(bot);
  registerTasklistCommand(bot);
  registerCommandsCommand(bot);
  registerSkillsCommand(bot);
  registerMcpsCommand(bot);
  registerModelsCommand(bot);
  registerOpencodeStartCommand(bot);
  registerOpencodeStopCommand(bot);

  // Register handlers
  registerPromptHandler(bot);
  registerQuestionCallback(bot);
  registerPermissionCallback(bot);
  registerAgentCallback(bot);
  registerProjectSelectCallback(bot);
  registerSessionSelectCallback(bot);

  safeBackgroundTask({
    taskName: "app.opencodeStartup",
    task: async () => {
      await opencodeAutoRestartService.start();
    },
  });

  let shutdownStarted = false;
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logger.info(`[App] Received ${signal}, shutting down...`);
    opencodeAutoRestartService.stop();

    shutdownTimeout = setTimeout(() => {
      logger.warn(`[App] Shutdown did not finish in ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit.`);
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimeout.unref?.();

    try {
      bot.stop();
    } catch (error) {
      logger.warn("[App] Failed to stop Telegram bot cleanly", error);
    }
  };

  const handleSigint = (): void => shutdown("SIGINT");
  const handleSigterm = (): void => shutdown("SIGTERM");
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  try {
    await bot.start();
  } finally {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
    }
    opencodeAutoRestartService.stop();
  }
}
