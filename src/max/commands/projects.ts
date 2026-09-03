import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { projectManager } from "../../project/manager.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";

const PROJECT_SELECT_CALLBACK_PREFIX = "project:";

function getProjectFolderName(worktree: string): string {
  const normalized = worktree.replace(/[\\/]+$/g, "");
  if (!normalized) return worktree;
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

async function buildProjectsMenu(chatId: number): Promise<{
  text: string;
  attachments: Array<{
    type: "inline_keyboard";
    payload: { buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> };
  }>;
}> {
  const { projectManager } = await import("../../project/manager.js");
  await projectManager.loadProjects();
  const projects = projectManager.getProjects();
  const currentProject = projectManager.getCurrentProject(chatId);

  let text = "📁 **Projects**\n\n";
  if (currentProject) {
    const currentFolder = getProjectFolderName(currentProject.worktree);
    text += `Current: ${currentFolder}\n\n`;
  }

  const buttons: Array<Array<{ type: "callback"; text: string; payload: string }>> = [];

  for (const project of projects) {
    const isActive = currentProject?.id === project.id;
    const folderName = getProjectFolderName(project.worktree);

    let label = `${folderName}`;
    if (isActive) label = `✅ ${label}`;

    const fullLabel = `${label}\n${project.worktree}`;

    buttons.push([
      {
        type: "callback",
        text: fullLabel,
        payload: `${PROJECT_SELECT_CALLBACK_PREFIX}${project.id}`,
      },
    ]);
  }

  return {
    text,
    attachments: [
      {
        type: "inline_keyboard",
        payload: { buttons },
      },
    ],
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
        await bot.sendMessage(chatId, { text: "No projects found." });
        return;
      }

      const { text, attachments } = await buildProjectsMenu(chatId);

      logger.debug(`[Projects] Sending menu with ${projects.length} projects`);
      await bot.sendMessage(chatId, {
        text,
        format: "markdown",
        attachments,
      });
    } catch (error) {
      logger.error("[Projects] Error:", error);
      await bot.sendMessage(chatId, { text: "❌ Failed to list projects." });
    }
  });
}

export function registerProjectSelectCallback(bot: MaxBot): void {
  bot.callback(PROJECT_SELECT_CALLBACK_PREFIX, async (userId, chatId, data, callback) => {
    logger.debug(`[ProjectSelectCallback] Received: ${data}`);

    if (!data.startsWith(PROJECT_SELECT_CALLBACK_PREFIX)) {
      return;
    }

    const projectId = data.replace(PROJECT_SELECT_CALLBACK_PREFIX, "");

    try {
      await bot.answerCallback(callback.callback_id, "⏳ Переключаю проект…");

      const { projectManager } = await import("../../project/manager.js");
      await projectManager.loadProjects();
      const project = projectManager.getProjectById(projectId);

      if (!project) {
        await bot.sendMessage(chatId, {
          text: "❌ Проект не найден. Обновите список командой /projects.",
        });
        return;
      }

      projectManager.setCurrentProject(chatId, projectId);
      const folderName = getProjectFolderName(project.worktree);

      const sessions = await openCodeWorkspace.listSessions(project.worktree);
      const buttons = sessions.slice(0, 10).map((session) => [
        {
          type: "callback" as const,
          text: `💬 ${session.title}`,
          payload: `select_session:${session.id}`,
        },
      ]);

      await bot.sendMessage(chatId, {
        text:
          `✅ **Проект выбран**\n\n${folderName}\n\`${project.worktree}\`\n\n` +
          (sessions.length > 0
            ? `💬 Сессии проекта: ${sessions.length}\nВыберите сессию или создайте новую командой /new.`
            : "📭 В папке пока нет сессий. Создайте первую командой /new."),
        format: "markdown",
        ...(buttons.length > 0
          ? {
              attachments: [
                {
                  type: "inline_keyboard" as const,
                  payload: { buttons },
                },
              ],
            }
          : {}),
      });

      logger.info(`[ProjectSelect] Project set to: ${projectId}`);
    } catch (error) {
      logger.error("[ProjectSelect] Error:", error);
      await bot.sendMessage(chatId, {
        text: "❌ Не удалось переключить проект. Проверьте, что OpenCode API доступен, и повторите /projects.",
      });
    }
  });
}
