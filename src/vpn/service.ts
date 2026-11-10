import { spawn } from "node:child_process";
import { config } from "../config.js";

const FETCH_TIMEOUT_MS = 30_000;
const SEARCH_TIMEOUT_MS = 15 * 60_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_CONFIGS = 20_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export type VpnProfile = "chatgpt" | "social";

export const VPN_PROFILE_LABELS: Record<VpnProfile, string> = {
  chatgpt: "ChatGPT",
  social: "Telegram + YouTube + Instagram",
};

const PROFILE_TEST_URLS: Record<VpnProfile, string[]> = {
  chatgpt: ["https://chatgpt.com/", "https://auth.openai.com/"],
  social: [
    "https://web.telegram.org/",
    "https://telegram.org/",
    "https://www.youtube.com/generate_204",
    "https://www.instagram.com/robots.txt",
  ],
};

let searchRunning = false;

export class VpnSearchAlreadyRunningError extends Error {
  constructor() {
    super("A VPN search is already running.");
    this.name = "VpnSearchAlreadyRunningError";
  }
}

export class VpnCheckerUnavailableError extends Error {
  constructor() {
    super("xray-knife is not installed or cannot be started.");
    this.name = "VpnCheckerUnavailableError";
  }
}

export class VpnSearchTimeoutError extends Error {
  constructor() {
    super("VPN configuration search timed out.");
    this.name = "VpnSearchTimeoutError";
  }
}

export function searchForVpnConfigs(
  profiles: VpnProfile[],
): Promise<Partial<Record<VpnProfile, string | null>>> {
  if (searchRunning) {
    throw new VpnSearchAlreadyRunningError();
  }

  searchRunning = true;
  return findVpnConfigs(profiles).finally(() => {
    searchRunning = false;
  });
}

async function findVpnConfigs(
  profiles: VpnProfile[],
): Promise<Partial<Record<VpnProfile, string | null>>> {
  const configs = await downloadConfigLinks();
  const results: Partial<Record<VpnProfile, string | null>> = {};
  for (const profile of profiles) {
    results[profile] = await runXrayKnife(configs, PROFILE_TEST_URLS[profile]);
  }
  return results;
}

async function downloadConfigLinks(): Promise<string[]> {
  const downloads = await Promise.allSettled(config.vpn.sourceUrls.map(downloadSource));
  const unique = new Set<string>();
  let successfulSources = 0;
  for (const download of downloads) {
    if (download.status === "rejected") continue;
    successfulSources++;
    for (const rawLine of download.value.split(/\r?\n/)) {
      const line = rawLine.trim().replace(/&amp;/g, "&");
      if (!line || line.startsWith("#") || !/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
        continue;
      }
      unique.add(line);
      if (unique.size > MAX_CONFIGS) {
        throw new Error(`VPN source contains more than ${MAX_CONFIGS} config links.`);
      }
    }
  }

  if (successfulSources === 0) {
    throw new Error("All VPN config sources failed to download.");
  }
  if (unique.size === 0) {
    throw new Error("VPN source did not contain any configuration links.");
  }

  return [...unique];
}

async function downloadSource(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`VPN source returned HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
    throw new Error("VPN source is too large to process.");
  }

  const source = await response.text();
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error("VPN source is too large to process.");
  }
  return source;
}

function runXrayKnife(configs: string[], testUrls: string[]): Promise<string | null> {
  const args = [
    "http",
    "--file",
    "-",
    "--prescan",
    "--prescan-workers",
    "512",
    "--prescan-timeout",
    "2000",
    "--threads",
    "300",
    "--mdelay",
    "5000",
    "--test-urls",
    testUrls.join(","),
    "--url-success-threshold",
    "1",
    "--max-passed",
    "1",
    "--out",
    "-",
    "--type",
    "txt",
    "--quiet",
  ];

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(config.vpn.checkerPath, args, {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let timedOut = false;
    let outputTooLarge = false;
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      forceKillTimer.unref?.();
    }, SEARCH_TIMEOUT_MS);
    timeout.unref?.();

    const finish = (error?: Error, result?: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (error) reject(error);
      else resolve(result ?? null);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (!outputTooLarge && Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
        outputTooLarge = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        forceKillTimer.unref?.();
      }
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(new VpnCheckerUnavailableError());
      } else {
        finish(new Error("Failed to start xray-knife."));
      }
    });

    child.once("close", (code) => {
      if (timedOut) {
        finish(new VpnSearchTimeoutError());
        return;
      }
      if (outputTooLarge) {
        finish(new Error("xray-knife produced too much output."));
        return;
      }
      if (code !== 0 && code !== 3) {
        finish(new Error(`xray-knife exited with code ${code ?? "unknown"}.`));
        return;
      }

      const result = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(line));
      finish(undefined, result ?? null);
    });

    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") finish(new Error("Could not send configs to xray-knife."));
    });
    child.stdin.end(configs.join("\n"));
  });
}
