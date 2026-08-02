import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";

export interface ProjectInfo {
  id: string;
  worktree: string;
}

class ProjectManager {
  private projects: ProjectInfo[] = [];

  async loadProjects(): Promise<void> {
    try {
      const { data, error } = await opencodeClient.project.list();

      if (error) {
        throw error;
      }

      const projectList = data ?? [];
      this.projects = [];

      for (const project of projectList) {
        this.projects.push({
          id: project.id ?? "",
          worktree: project.worktree ?? "",
        });
      }
    } catch (error) {
      logger.error("[ProjectManager] Failed to load projects:", error);
    }
  }

  getProjects(): ProjectInfo[] {
    return this.projects;
  }

  getProjectById(id: string): ProjectInfo | undefined {
    return this.projects.find((p) => p.id === id);
  }
}

export const projectManager = new ProjectManager();
