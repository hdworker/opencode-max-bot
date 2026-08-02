import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { logger } from "../utils/logger.js";

export interface SettingsData {
  currentProject: string | null;
  currentSession: string | null;
  currentAgent: string | null;
  currentModel: string | null;
  pinnedMessageId: number | null;
  ttsEnabled: boolean;
  sessionDirectoryCache: Map<string, string>;
}

const SETTINGS_FILE = "settings.json";

class SettingsManager {
  private data: SettingsData = {
    currentProject: null,
    currentSession: null,
    currentAgent: null,
    currentModel: null,
    pinnedMessageId: null,
    ttsEnabled: false,
    sessionDirectoryCache: new Map(),
  };

  private filePath = "";
  private writeQueue: Promise<void> = Promise.resolve();

  init(runningFromSources: boolean): void {
    const baseDir = runningFromSources ? process.cwd() : process.cwd();
    this.filePath = join(baseDir, SETTINGS_FILE);
    this.load();
  }

  async load(): Promise<void> {
    this.loadSync();
  }

  private loadSync(): void {
    try {
      if (!existsSync(this.filePath)) return;

      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      this.data = {
        ...this.data,
        ...parsed,
        sessionDirectoryCache: new Map(
          Object.entries(parsed.sessionDirectoryCache ?? {}),
        ),
      };
    } catch (error) {
      logger.error("[Settings] Failed to load:", error);
    }
  }

  private save(): void {
    this.writeQueue = this.writeQueue.then(() => {
      try {
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const serializable = {
          ...this.data,
          sessionDirectoryCache: Object.fromEntries(this.data.sessionDirectoryCache),
        };

        writeFileSync(this.filePath, JSON.stringify(serializable, null, 2));
      } catch (error) {
        logger.error("[Settings] Failed to save:", error);
      }
    });
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.save();
  }

  getCurrentProject(): string | null {
    return this.data.currentProject;
  }

  setCurrentProject(project: string | null): void {
    this.data.currentProject = project;
    this.save();
  }

  getCurrentSession(): string | null {
    return this.data.currentSession;
  }

  setCurrentSession(session: string | null): void {
    this.data.currentSession = session;
    this.save();
  }

  getCurrentAgent(): string | null {
    return this.data.currentAgent;
  }

  setCurrentAgent(agent: string | null): void {
    this.data.currentAgent = agent;
    this.save();
  }

  getCurrentModel(): string | null {
    return this.data.currentModel;
  }

  setCurrentModel(model: string | null): void {
    this.data.currentModel = model;
    this.save();
  }

  getPinnedMessageId(): number | null {
    return this.data.pinnedMessageId;
  }

  setPinnedMessageId(id: number | null): void {
    this.data.pinnedMessageId = id;
    this.save();
  }

  isTtsEnabled(): boolean {
    return this.data.ttsEnabled;
  }

  setTtsEnabled(enabled: boolean): void {
    this.data.ttsEnabled = enabled;
    this.save();
  }
}

export const settingsManager = new SettingsManager();
