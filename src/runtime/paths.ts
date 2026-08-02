import { join } from "node:path";

export interface RuntimePaths {
  envFilePath: string;
  settingsFilePath: string;
  logDirPath: string;
}

let paths: RuntimePaths | null = null;

export function getRuntimePaths(): RuntimePaths {
  if (paths) {
    return paths;
  }

  const baseDir = process.cwd();
  paths = {
    envFilePath: join(baseDir, ".env"),
    settingsFilePath: join(baseDir, "settings.json"),
    logDirPath: join(baseDir, "logs"),
  };
  return paths;
}
