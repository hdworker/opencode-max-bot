import type { MaxBot } from "../bot.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";
import { settingsManager } from "../../settings/manager.js";

const PROJECT_SELECT_CALLBACK_PREFIX = "project:";

function getProjectFolderName(worktree: string): string {
  const normalized = worktree.replace(/[\\/]+$/g, "");
  if (!normalized) return worktree;
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

async function buildProjectsMenu(userId: number): Promise<{ text: string; attachments: Array<{ type: "inline_keyboard"; payload: { buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> } }> }> {
  const { projectManager } = await import("../../project/manager.js");
  await projectManager.loadProjects();
  const projects = projectManager.getProjects();
  const currentProject = settingsManager.getCurrentProject();

  let text = "📁 **Projects**\n\n";
  if (currentProject) {
    const currentFolder = getProjectFolderName(currentProject);
    text += `Current: ${currentFolder}\n\n`;
  }

  const buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> = [];

  for (const project of projects) {
    const isActive = currentProject === project.id;
    const folderName = getProjectFolderName(project.worktree);
    
    let label = `${folderName}`;
    if (isActive) label = `✅ ${label}`;
    
    const fullLabel = `${label}\n${project.worktree}`;
    
    buttons.push([{
      type: "callback",
      text: fullLabel,
      payload: `${PROJECT_SELECT_CALLBACK_PREFIX}${project.id}`,
    }]);
  }

  return {
    text,
    attachments: [{
      type: "inline_keyboard",
      payload: { buttons },
    }],
  };
}

export function registerProjectsCommand(bot: MaxBot): void {
  bot.command("projects", "List available projects", async (userId, chatId) => {
    try {
      const { projectManager } = await import("../../project/manager.js");
      await projectManager.loadProjects();
      const projects = projectManager.getProjects();

      logger.info(`[Projects] Loaded ${projects.length} projects`);

      if (projects.length === 0) {
        logger.warn("[Projects] No projects found");
        await bot.sendMessage(userId, { text: "No projects found." });
        return;
      }

      const { text, attachments } = await buildProjectsMenu(userId);

      logger.debug(`[Projects] Sending menu with ${projects.length} projects`);
      await bot.sendMessage(userId, {
        text,
        format: "markdown",
        attachments,
      });
    } catch (error) {
      logger.error("[Projects] Error:", error);
      await bot.sendMessage(userId, { text: "❌ Failed to list projects." });
    }
  });
}

export function registerProjectSelectCallback(bot: MaxBot): void {
  bot.onCallback(async (userId, chatId, data, callback) => {
    logger.debug(`[ProjectSelectCallback] Received: ${data}`);
    
    if (!data.startsWith(PROJECT_SELECT_CALLBACK_PREFIX)) {
      return;
    }

    const projectId = data.replace(PROJECT_SELECT_CALLBACK_PREFIX, "");
    
    try {
      const { projectManager } = await import("../../project/manager.js");
      await projectManager.loadProjects();
      const project = projectManager.getProjectById(projectId);

      if (!project) {
        await bot.answerCallback(callback.callback_id, "❌ Project not found");
        return;
      }

      settingsManager.setCurrentProject(projectId);
      const folderName = getProjectFolderName(project.worktree);

      await bot.answerCallback(callback.callback_id, `✅ Project: ${folderName}`);
      await bot.sendMessage(userId, {
        text: `✅ **Project selected**\n\n${folderName}\n\`${project.worktree}\``,
        format: "markdown",
      });

      logger.info(`[ProjectSelect] Project set to: ${projectId}`);
    } catch (error) {
      logger.error("[ProjectSelect] Error:", error);
      await bot.answerCallback(callback.callback_id, "❌ Failed to select project");
    }
  });
}
