import { config as loadEnv } from "dotenv";

loadEnv();

const defaultVpnSourceUrls = [1, 6, 22, 23, 24, 26].map(
  (file) =>
    "https://raw.githubusercontent.com/aneek0/goida-vpn-configs/refs/heads/main/githubmirror/" +
    file +
    ".txt",
);
const configuredVpnSourceUrls = (process.env.VPN_SOURCE_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const vpnSourceUrls = configuredVpnSourceUrls.length
  ? configuredVpnSourceUrls
  : process.env.VPN_SOURCE_URL
    ? [process.env.VPN_SOURCE_URL]
    : defaultVpnSourceUrls;

export const config = {
  max: {
    token: process.env.MAX_TOKEN || "",
    allowedUserId: Number(process.env.MAX_ALLOWED_USER_ID) || 0,
    apiUrl: process.env.MAX_API_URL || "https://platform-api.max.ru",
  },
  opencode: {
    apiUrl: process.env.OPENCODE_API_URL || "http://localhost:4096",
    password: process.env.OPENCODE_PASSWORD || "",
    model: process.env.OPENCODE_MODEL || "",
    autoRestartEnabled: process.env.OPENCODE_AUTO_RESTART_ENABLED !== "false",
    monitorIntervalSec: Number(process.env.OPENCODE_MONITOR_INTERVAL_SEC) || 30,
  },
  knowledgeBase: {
    ingestUrl: process.env.KB_INGEST_URL || "http://127.0.0.1:8100/ingest",
    listUrl: process.env.KB_LIST_URL || "http://127.0.0.1:8100/articles",
    ingestToken: process.env.KB_INGEST_TOKEN || "",
    summarizeWithOpenCode: process.env.KB_SUMMARIZE_WITH_OPENCODE !== "false",
  },
  vpn: {
    sourceUrls: vpnSourceUrls,
    checkerPath: process.env.VPN_XRAY_KNIFE_PATH || "xray-knife",
  },
  server: {
    logLevel: (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error",
  },
  bot: {
    locale: process.env.OPENCODE_LOCALE || "ru",
  },
} as const;
