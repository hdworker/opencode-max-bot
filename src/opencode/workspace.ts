import { opencodeClient } from "./client.js";

export interface WorkspaceProject {
  id: string;
  worktree: string;
}

export interface WorkspaceSession {
  id: string;
  title: string;
  directory?: string;
}

export interface WorkspaceAgent {
  name: string;
  description?: string;
}

export interface WorkspaceModel {
  id: string;
  name: string;
  providerId: string;
  variants: string[];
}

type McpCapableClient = {
  app?: {
    mcp?: {
      status: (input?: {
        directory?: string;
      }) => Promise<{ data?: Record<string, unknown>; error?: unknown }>;
    };
  };
};

class OpenCodeWorkspace {
  async listProjects(): Promise<WorkspaceProject[]> {
    const result = await opencodeClient.project.list();
    if (result.error) throw result.error;
    return (result.data ?? []).map((project) => ({
      id: project.id ?? "",
      worktree: project.worktree ?? "",
    }));
  }

  async listSessions(directory?: string): Promise<WorkspaceSession[]> {
    const result = await opencodeClient.session.list({ directory });
    if (result.error) throw result.error;
    return (result.data ?? []).map((session) => ({
      id: session.id ?? "",
      title: session.title ?? "Без названия",
      directory: session.directory,
    }));
  }

  async getSession(sessionId: string, directory?: string): Promise<WorkspaceSession> {
    const result = await opencodeClient.session.get({ sessionID: sessionId, directory });
    if (result.error || !result.data) throw result.error ?? new Error("Session not found");
    return {
      id: result.data.id ?? sessionId,
      title: result.data.title ?? "Без названия",
      directory: result.data.directory,
    };
  }

  async createSession(directory?: string, title?: string): Promise<WorkspaceSession> {
    const result = await opencodeClient.session.create({ directory, title });
    if (result.error || !result.data) throw result.error ?? new Error("Failed to create session");
    return {
      id: result.data.id ?? "",
      title: result.data.title ?? title ?? "Без названия",
      directory: result.data.directory,
    };
  }

  async listAgents(directory?: string): Promise<WorkspaceAgent[]> {
    const result = await opencodeClient.app.agents({ directory });
    if (result.error) throw result.error;
    return (result.data ?? []).map((agent) => ({
      name: agent.name ?? "",
      description: agent.description,
    }));
  }

  async listModels(directory?: string): Promise<WorkspaceModel[]> {
    const result = await opencodeClient.config.providers({ directory });
    if (result.error) throw result.error;

    const models: WorkspaceModel[] = [];
    for (const provider of result.data?.providers ?? []) {
      for (const [id, model] of Object.entries(provider.models ?? {})) {
        models.push({
          id,
          name: model.name ?? id,
          providerId: provider.id ?? "",
          variants: Object.keys(model.variants ?? {}),
        });
      }
    }
    return models;
  }

  async listMcps(directory?: string): Promise<string[]> {
    const client = opencodeClient as McpCapableClient;
    if (!client.app?.mcp?.status) return [];
    const result = await client.app.mcp.status({ directory });
    if (result.error) throw result.error;
    return Object.keys(result.data ?? {});
  }
}

export const openCodeWorkspace = new OpenCodeWorkspace();
