import { join, resolve } from "node:path";

export interface RuntimePaths {
  dataDirPath: string;
  envFilePath: string;
  settingsFilePath: string;
  logDirPath: string;
}

let paths: RuntimePaths | null = null;

export function getRuntimePaths(): RuntimePaths {
  if (paths) {
    return paths;
  }

  const configuredDataDir = process.env.OPENCODE_MAX_BOT_DATA_DIR?.trim();
  const baseDir = configuredDataDir ? resolve(configuredDataDir) : process.cwd();
  paths = {
    dataDirPath: baseDir,
    envFilePath: join(process.cwd(), ".env"),
    settingsFilePath: join(baseDir, "settings.json"),
    logDirPath: join(baseDir, "logs"),
  };
  return paths;
}
