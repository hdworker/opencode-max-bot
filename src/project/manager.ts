import { logger } from "../utils/logger.js";
import { settingsManager } from "../settings/manager.js";
import { conversationContext } from "../conversation/context.js";
import { openCodeWorkspace } from "../opencode/workspace.js";

export interface ProjectInfo {
  id: string;
  worktree: string;
}

class ProjectManager {
  private projects: ProjectInfo[] = [];

  private customProject(path: string): ProjectInfo {
    return { id: `directory:${path}`, worktree: path };
  }

  async loadProjects(): Promise<void> {
    try {
      this.projects = await openCodeWorkspace.listProjects();
    } catch (error) {
      logger.error("[ProjectManager] Failed to load projects:", error);
    }
  }

  getProjects(): ProjectInfo[] {
    return this.projects;
  }

  getProjectById(id: string): ProjectInfo | undefined {
    return this.projects.find((p) => p.id === id) ??
      (id.startsWith("directory:") ? this.customProject(id.slice("directory:".length)) : undefined);
  }

  setCurrentProjectDirectory(chatId: number, directory: string): ProjectInfo {
    const project = this.customProject(directory);
    this.setCurrentProject(chatId, project.id);
    return project;
  }

  getCurrentProject(chatId?: number): ProjectInfo | undefined {
    const currentProjectId =
      chatId === undefined
        ? settingsManager.getCurrentProject()
        : conversationContext.get(chatId).projectId;
    return currentProjectId ? this.getProjectById(currentProjectId) : undefined;
  }

  getCurrentProjectDirectory(chatId?: number): string | undefined {
    return this.getCurrentProject(chatId)?.worktree || undefined;
  }

  setCurrentProject(chatId: number, projectId: string | null): void {
    conversationContext.setProject(chatId, projectId);
  }
}

export const projectManager = new ProjectManager();
