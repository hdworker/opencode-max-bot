import { config as loadEnv } from "dotenv";

loadEnv();

export const config = {
  max: {
    token: process.env.MAX_TOKEN || "",
    allowedUserId: Number(process.env.MAX_ALLOWED_USER_ID) || 0,
  },
  opencode: {
    apiUrl: process.env.OPENCODE_API_URL || "http://localhost:4096",
    password: process.env.OPENCODE_PASSWORD || "",
    model: process.env.OPENCODE_MODEL || "",
    autoRestartEnabled: process.env.OPENCODE_AUTO_RESTART_ENABLED !== "false",
    monitorIntervalSec: Number(process.env.OPENCODE_MONITOR_INTERVAL_SEC) || 30,
  },
  server: {
    logLevel: (process.env.LOG_LEVEL || "info") as
      | "debug"
      | "info"
      | "warn"
      | "error",
  },
  bot: {
    locale: process.env.OPENCODE_LOCALE || "en",
  },
} as const;
