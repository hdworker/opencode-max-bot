import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { config } from "../config.js";

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

type LogLevel = keyof typeof LOG_LEVELS;

let logFilePath = "";
let currentLevel: LogLevel = config.server.logLevel as LogLevel;

export async function initializeLogger(): Promise<void> {
  ensureLogDir();
}

function ensureLogDir(): void {
  if (logFilePath || !existsSync(".")) return;
  const logsDir = join(process.cwd(), "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "-");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "-");
  logFilePath = join(logsDir, `bot-${date}_${time}_${process.pid}.log`);
}

function formatMessage(level: LogLevel, message: string, details?: unknown): string {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (details !== undefined) {
    const detailStr = typeof details === "string" ? details : JSON.stringify(details);
    line += ` | ${detailStr}`;
  }
  return line;
}

function writeLog(level: LogLevel, message: string, details?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const line = formatMessage(level, message, details);

  const prefix = `[${level.toUpperCase()}]`;
  switch (level) {
    case "debug":
      console.debug(prefix, message, details ?? "");
      break;
    case "info":
      console.info(prefix, message, details ?? "");
      break;
    case "warn":
      console.warn(prefix, message, details ?? "");
      break;
    case "error":
      console.error(prefix, message, details ?? "");
      break;
  }

  try {
    ensureLogDir();
    if (logFilePath) {
      appendFileSync(logFilePath, line + "\n");
    }
  } catch {
    // ignore write errors
  }
}

export const logger = {
  debug: (message: string, details?: unknown) => writeLog("debug", message, details),
  info: (message: string, details?: unknown) => writeLog("info", message, details),
  warn: (message: string, details?: unknown) => writeLog("warn", message, details),
  error: (message: string, details?: unknown) => writeLog("error", message, details),
  setLevel: (level: LogLevel) => {
    currentLevel = level;
  },
};
