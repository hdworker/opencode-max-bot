import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const FETCH_TIMEOUT_MS = 30_000;
const README_TIMEOUT_MS = 15_000;
const SEARCH_TIMEOUT_MS = 15 * 60_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_CONFIGS = 20_000;
const MAX_JSONL_LINE_BYTES = 256 * 1024;
const STATUS_FILE_PATH = join(homedir(), ".opencode-max-bot", "vpn-diagnostics.json");
const GOIDA_README_URL =
  "https://raw.githubusercontent.com/aneek0/goida-vpn-configs/refs/heads/main/README.md";

export type VpnProfile = "chatgpt" | "social";

export const VPN_PROFILE_LABELS: Record<VpnProfile, string> = {
  chatgpt: "ChatGPT",
  social: "Telegram + YouTube + Instagram",
};

export const PROFILE_TEST_URLS: Record<VpnProfile, string[]> = {
  chatgpt: ["https://chatgpt.com/", "https://auth.openai.com/"],
  social: [
    "https://web.telegram.org/",
    "https://telegram.org/",
    "https://www.youtube.com/generate_204",
    "https://www.instagram.com/robots.txt",
  ],
};

export interface VpnSourceDiagnostic {
  name: string;
  status: "pending" | "downloaded" | "failed";
  attemptedAt?: string;
  downloadedAt?: string;
  fileUpdatedAt?: string;
  updateTimestampSource?: "README" | "HTTP Last-Modified";
  bytes?: number;
  configLinks?: number;
  queuedConfigs?: number;
  downloadDurationMs?: number;
  error?: string;
}

export interface VpnEndpointDiagnostic {
  total: number;
  succeeded: number;
  failed: number;
  timedOut: number;
}

export interface VpnProfileDiagnostic {
  profile: VpnProfile;
  status: "pending" | "running" | "completed" | "failed" | "timed_out";
  candidateCount: number;
  testedCount: number;
  passedCount: number;
  semiPassedCount: number;
  failedCount: number;
  unparsedResultCount: number;
  maxPassed: number;
  durationMs: number;
  exitCode?: number | null;
  error?: string;
  failureKinds: Record<string, number>;
  endpoints: Record<string, VpnEndpointDiagnostic>;
  firstPassed?: {
    id: string;
    exitIp?: string;
    country?: string;
    delayMs?: number;
    succeededEndpoints: number;
    totalEndpoints: number;
  };
}

export interface VpnIssuedConfigDiagnostic {
  id: string;
  profile: VpnProfile;
  issuedAt: string;
  exitIp?: string;
  country?: string;
  delayMs?: number;
  succeededEndpoints: number;
  totalEndpoints: number;
}

export interface VpnDiagnostics {
  runId: string;
  status: "running" | "completed" | "failed";
  phase: "source-download" | "profile-check" | "complete";
  activeProfile?: VpnProfile;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  sourceMetadataError?: string;
  sources: VpnSourceDiagnostic[];
  rawConfigLinkCount: number;
  candidateCount: number;
  candidateLimit: number;
  poolMayBeTruncated: boolean;
  profiles: Partial<Record<VpnProfile, VpnProfileDiagnostic>>;
  lastIssued: VpnIssuedConfigDiagnostic[];
  error?: string;
}

export interface VpnSearchResult {
  configs: Partial<Record<VpnProfile, string | null>>;
  diagnostics: VpnDiagnostics;
}

interface SourceDownload {
  text: string;
  bytes: number;
  downloadedAt: string;
  fileUpdatedAt?: string;
  updateTimestampSource?: "README" | "HTTP Last-Modified";
  durationMs: number;
}

interface XrayResultRecord extends Record<string, unknown> {
  status?: unknown;
  link?: unknown;
  failureKind?: unknown;
  endpoints?: unknown;
}

interface XrayRunResult {
  config: string | null;
  diagnostics: VpnProfileDiagnostic;
}

let searchRunning = false;
let currentDiagnostics: VpnDiagnostics | null = null;
let diagnosticsLoaded = false;
let persistQueue: Promise<void> = Promise.resolve();

export class VpnSearchAlreadyRunningError extends Error {
  constructor() {
    super("A VPN search is already running.");
    this.name = "VpnSearchAlreadyRunningError";
  }
}

export async function getVpnDiagnostics(): Promise<VpnDiagnostics | null> {
  await loadPersistedDiagnostics();
  return currentDiagnostics ? cloneDiagnostics(currentDiagnostics) : null;
}

export async function searchForVpnConfigs(
  profiles: VpnProfile[],
): Promise<VpnSearchResult> {
  await loadPersistedDiagnostics();
  if (searchRunning) {
    throw new VpnSearchAlreadyRunningError();
  }

  searchRunning = true;
  try {
    return await findVpnConfigs(profiles);
  } finally {
    searchRunning = false;
  }
}

async function findVpnConfigs(
  profiles: VpnProfile[],
): Promise<VpnSearchResult> {
  const startedAt = new Date().toISOString();
  const previousIssued = currentDiagnostics?.lastIssued ?? [];
  const report: VpnDiagnostics = {
    runId: createHash("sha256")
      .update(startedAt + ":" + process.pid + ":" + Math.random())
      .digest("hex")
      .slice(0, 12),
    status: "running",
    phase: "source-download",
    startedAt,
    updatedAt: startedAt,
    sources: config.vpn.sourceUrls.map((url, index) => ({
      name: getSourceName(url, index),
      status: "pending",
    })),
    rawConfigLinkCount: 0,
    candidateCount: 0,
    candidateLimit: MAX_CONFIGS,
    poolMayBeTruncated: false,
    profiles: {},
    lastIssued: previousIssued.slice(-10),
  };
  const configsByProfile: Partial<Record<VpnProfile, string | null>> = {};
  let lastPersistedAt = 0;

  const publish = (force = false): void => {
    const now = Date.now();
    report.updatedAt = new Date(now).toISOString();
    currentDiagnostics = cloneDiagnostics(report);

    if (force || now - lastPersistedAt >= 5_000) {
      lastPersistedAt = now;
      void persistDiagnostics(report);
    }

  };

  logger.info("[VPN] Search started.", {
    runId: report.runId,
    profiles,
    sourceCount: report.sources.length,
    candidateLimit: MAX_CONFIGS,
  });
  publish(true);

  try {
    const readmeTimes = await fetchGoidaFileUpdateTimes();
    if (readmeTimes.error) {
      report.sourceMetadataError = readmeTimes.error;
    }

    const downloaded: Array<SourceDownload | null> = report.sources.map(() => null);
    await Promise.all(
      config.vpn.sourceUrls.map(async (sourceUrl, index) => {
        const source = report.sources[index]!;
        source.attemptedAt = new Date().toISOString();
        const started = Date.now();
        try {
          const readmeUpdatedAt = isGoidaSource(sourceUrl)
            ? readmeTimes.timestamps.get(source.name)
            : undefined;
          const result = await downloadSource(sourceUrl, readmeUpdatedAt, started);
          downloaded[index] = result;
          source.status = "downloaded";
          source.downloadedAt = result.downloadedAt;
          source.fileUpdatedAt = result.fileUpdatedAt;
          source.updateTimestampSource = result.updateTimestampSource;
          source.bytes = result.bytes;
          source.downloadDurationMs = result.durationMs;
        } catch (error) {
          source.status = "failed";
          source.downloadDurationMs = Date.now() - started;
          source.error = classifySourceError(error);
        }
        publish();
      }),
    );

    const configs: string[] = [];
    const queued = new Set<string>();
    let successfulSources = 0;
    for (let index = 0; index < downloaded.length; index++) {
      const result = downloaded[index];
      const source = report.sources[index]!;
      if (!result) {
        logger.warn("[VPN] Source download failed.", {
          runId: report.runId,
          source: source.name,
          error: source.error,
        });
        continue;
      }

      successfulSources++;
      const links = parseConfigLinks(result.text);
      source.configLinks = links.length;
      let added = 0;
      for (const link of links) {
        report.rawConfigLinkCount++;
        if (queued.has(link)) continue;
        if (configs.length >= MAX_CONFIGS) {
          report.poolMayBeTruncated = true;
          continue;
        }
        queued.add(link);
        configs.push(link);
        added++;
      }
      source.queuedConfigs = added;
      report.candidateCount = configs.length;
      logger.info("[VPN] Source downloaded.", {
        runId: report.runId,
        source: source.name,
        downloadedAt: source.downloadedAt,
        fileUpdatedAt: source.fileUpdatedAt,
        updateTimestampSource: source.updateTimestampSource,
        bytes: source.bytes,
        configLinks: source.configLinks,
        queuedConfigs: source.queuedConfigs,
        downloadDurationMs: source.downloadDurationMs,
      });
    }

    publish(true);
    if (successfulSources === 0) {
      report.status = "failed";
      report.error = "all-sources-failed";
      return finishReport(report, configsByProfile);
    }
    if (configs.length === 0) {
      report.status = "failed";
      report.error = "no-config-links";
      return finishReport(report, configsByProfile);
    }

    if (report.poolMayBeTruncated) {
      logger.warn("[VPN] Candidate pool reached its safety limit.", {
        runId: report.runId,
        queuedConfigs: configs.length,
        candidateLimit: MAX_CONFIGS,
        rawConfigLinks: report.rawConfigLinkCount,
      });
    }

    report.phase = "profile-check";
    for (const profile of profiles) {
      report.activeProfile = profile;
      const profileReport: VpnProfileDiagnostic = {
        profile,
        status: "running",
        candidateCount: configs.length,
        testedCount: 0,
        passedCount: 0,
        semiPassedCount: 0,
        failedCount: 0,
        unparsedResultCount: 0,
        maxPassed: 1,
        durationMs: 0,
        failureKinds: {},
        endpoints: {},
      };
      report.profiles[profile] = profileReport;
      publish(true);

      const result = await runXrayKnife(
        configs,
        PROFILE_TEST_URLS[profile],
        profileReport,
        report.runId,
        publish,
      );
      configsByProfile[profile] = result.config;
      report.profiles[profile] = result.diagnostics;

      if (result.config && result.diagnostics.firstPassed) {
        report.lastIssued.push({
          id: result.diagnostics.firstPassed.id,
          profile,
          issuedAt: new Date().toISOString(),
          exitIp: result.diagnostics.firstPassed.exitIp,
          country: result.diagnostics.firstPassed.country,
          delayMs: result.diagnostics.firstPassed.delayMs,
          succeededEndpoints: result.diagnostics.firstPassed.succeededEndpoints,
          totalEndpoints: result.diagnostics.firstPassed.totalEndpoints,
        });
        report.lastIssued = report.lastIssued.slice(-10);
        logger.info("[VPN] Config issued.", {
          runId: report.runId,
          id: result.diagnostics.firstPassed.id,
          profile,
          exitIp: result.diagnostics.firstPassed.exitIp,
          country: result.diagnostics.firstPassed.country,
          succeededEndpoints: result.diagnostics.firstPassed.succeededEndpoints,
          totalEndpoints: result.diagnostics.firstPassed.totalEndpoints,
        });
      }
      logger.info("[VPN] Profile check completed.", {
        runId: report.runId,
        profile,
        candidateCount: result.diagnostics.candidateCount,
        testedCount: result.diagnostics.testedCount,
        passedCount: result.diagnostics.passedCount,
        semiPassedCount: result.diagnostics.semiPassedCount,
        failedCount: result.diagnostics.failedCount,
        failureKinds: result.diagnostics.failureKinds,
        endpoints: result.diagnostics.endpoints,
        durationMs: result.diagnostics.durationMs,
        exitCode: result.diagnostics.exitCode,
        error: result.diagnostics.error,
      });
      publish(true);
    }

    report.status = Object.values(report.profiles).some(
      (item) => item?.status === "failed" || item?.status === "timed_out",
    )
      ? "failed"
      : "completed";
    return finishReport(report, configsByProfile);
  } catch (error) {
    report.status = "failed";
    report.error = classifyUnexpectedError(error);
    logger.error("[VPN] Search failed.", {
      runId: report.runId,
      error: report.error,
      sourceCount: report.sources.length,
      rawConfigLinks: report.rawConfigLinkCount,
      candidateCount: report.candidateCount,
    });
    return finishReport(report, configsByProfile);
  }

  async function finishReport(
    finalReport: VpnDiagnostics,
    foundConfigs: Partial<Record<VpnProfile, string | null>>,
  ): Promise<VpnSearchResult> {
    finalReport.phase = "complete";
    finalReport.activeProfile = undefined;
    finalReport.finishedAt = new Date().toISOString();
    finalReport.updatedAt = finalReport.finishedAt;
    currentDiagnostics = cloneDiagnostics(finalReport);
    await persistDiagnostics(finalReport);
    if (finalReport.status === "completed") {
      logger.info("[VPN] Search completed.", {
        runId: finalReport.runId,
        durationMs: Date.parse(finalReport.finishedAt) - Date.parse(finalReport.startedAt),
        sourceCount: finalReport.sources.filter((source) => source.status === "downloaded").length,
        rawConfigLinks: finalReport.rawConfigLinkCount,
        candidateCount: finalReport.candidateCount,
        poolMayBeTruncated: finalReport.poolMayBeTruncated,
        issuedCount: finalReport.lastIssued.length,
      });
    }
    return {
      configs: foundConfigs,
      diagnostics: cloneDiagnostics(finalReport),
    };
  }
}

async function downloadSource(
  sourceUrl: string,
  readmeUpdatedAt: string | undefined,
  startedAt: number,
): Promise<SourceDownload> {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error("http-" + response.status);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SOURCE_BYTES) {
    throw new Error("source-too-large");
  }

  const text = await response.text();
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_SOURCE_BYTES) {
    throw new Error("source-too-large");
  }

  const httpLastModified = parseHttpDate(response.headers.get("last-modified"));
  const fileUpdatedAt = readmeUpdatedAt ?? httpLastModified;
  return {
    text,
    bytes,
    downloadedAt: new Date().toISOString(),
    fileUpdatedAt,
    updateTimestampSource: readmeUpdatedAt
      ? "README"
      : httpLastModified
        ? "HTTP Last-Modified"
        : undefined,
    durationMs: Date.now() - startedAt,
  };
}

function parseConfigLinks(source: string): string[] {
  const links: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/&amp;/g, "&");
    if (!line || line.startsWith("#") || !/^[a-z][a-z0-9+.-]*:\/\//i.test(line)) {
      continue;
    }
    links.push(line);
  }
  return links;
}

async function fetchGoidaFileUpdateTimes(): Promise<{
  timestamps: Map<string, string>;
  error?: string;
}> {
  try {
    const response = await fetch(GOIDA_README_URL, {
      signal: AbortSignal.timeout(README_TIMEOUT_MS),
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) {
      return { timestamps: new Map(), error: "readme-http-" + response.status };
    }
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) {
      return { timestamps: new Map(), error: "readme-too-large" };
    }

    const timestamps = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      const cells = line.split("|").map((cell) => cell.trim());
      if (cells.length < 7) continue;
      const number = Number(cells[1]);
      const time = /(\d{2}):(\d{2})\s*\(МСК\)/.exec(cells[4] ?? "");
      const date = /(\d{2})\.(\d{2})\.(\d{4})/.exec(cells[5] ?? "");
      if (!Number.isInteger(number) || !time || !date) continue;

      const hour = Number(time[1]);
      const minute = Number(time[2]);
      const day = Number(date[1]);
      const month = Number(date[2]);
      const year = Number(date[3]);
      const timestamp = Date.UTC(year, month - 1, day, hour - 3, minute);
      if (Number.isFinite(timestamp)) {
        timestamps.set(number + ".txt", new Date(timestamp).toISOString());
      }
    }
    return { timestamps };
  } catch (error) {
    return { timestamps: new Map(), error: classifySourceError(error) };
  }
}

function parseHttpDate(value: string | null): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function isGoidaSource(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    return (
      (parsed.hostname === "raw.githubusercontent.com" ||
        parsed.hostname === "github.com") &&
      parsed.pathname.includes("/aneek0/goida-vpn-configs/")
    );
  } catch {
    return false;
  }
}

function getSourceName(sourceUrl: string, index: number): string {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const numericName = /(?:^|\/)(\d+)\.txt$/i.exec(pathname);
    if (numericName) return numericName[1] + ".txt";
    const basename = pathname.split("/").filter(Boolean).at(-1);
    if (basename && /^[a-z0-9._-]{1,40}$/i.test(basename)) return basename;
  } catch {
    // The fetch path will report an invalid source URL.
  }
  return "source-" + (index + 1);
}

function classifySourceError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("http-")) return error.message;
  if (error instanceof Error && error.message === "source-too-large") return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof TypeError) return "network-error";
  return "source-error";
}

function classifyUnexpectedError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof TypeError) return "network-error";
  return "unexpected-error";
}

function runXrayKnife(
  configs: string[],
  testUrls: string[],
  profileStats: VpnProfileDiagnostic,
  runId: string,
  publish: (force?: boolean) => void,
): Promise<XrayRunResult> {
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
    "jsonl",
    "--quiet",
  ];

  const startedAt = Date.now();
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(config.vpn.checkerPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      profileStats.status = "failed";
      profileStats.error = "checker-start-error";
      resolve({ config: null, diagnostics: profileStats });
      return;
    }

    let stdoutBuffer = "";
    let stderrSummary = "";
    let firstConfig: string | null = null;
    let timedOut = false;
    let lineTooLarge = false;
    let settled = false;
    let progressRecords = 0;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      forceKillTimer.unref?.();
    }, SEARCH_TIMEOUT_MS);
    timeout.unref?.();

    const finish = (code: number | null, spawnError?: NodeJS.ErrnoException): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      profileStats.durationMs = Date.now() - startedAt;
      profileStats.exitCode = code;

      if (timedOut) {
        profileStats.status = "timed_out";
        profileStats.error = "xray-timeout";
      } else if (lineTooLarge) {
        profileStats.status = "failed";
        profileStats.error = "xray-jsonl-line-too-large";
      } else if (spawnError) {
        profileStats.status = "failed";
        profileStats.error = spawnError.code === "ENOENT"
          ? "checker-not-installed"
          : "checker-start-error";
      } else if (code !== 0 && code !== 3) {
        profileStats.status = "failed";
        profileStats.error = "xray-exit-" + String(code ?? "unknown");
      } else if (profileStats.testedCount === 0) {
        profileStats.status = "failed";
        profileStats.error = "xray-returned-no-results";
      } else {
        profileStats.status = "completed";
      }

      const summary = /Error:\s+(\d+)\s+of\s+(\d+)\s+configs passed/i.exec(stderrSummary);
      if (summary && profileStats.testedCount === 0) {
        profileStats.failedCount = Number(summary[2]) - Number(summary[1]);
      }
      logger.info("[VPN] xray-knife run finished.", {
        runId,
        profile: profileStats.profile,
        status: profileStats.status,
        candidateCount: profileStats.candidateCount,
        testedCount: profileStats.testedCount,
        passedCount: profileStats.passedCount,
        failedCount: profileStats.failedCount,
        failureKinds: profileStats.failureKinds,
        endpoints: profileStats.endpoints,
        durationMs: profileStats.durationMs,
        exitCode: code,
        error: profileStats.error,
      });
      publish(true);
      resolve({ config: firstConfig, diagnostics: profileStats });
    };

    const consumeJsonlLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line) return;
      if (Buffer.byteLength(line, "utf8") > MAX_JSONL_LINE_BYTES) {
        lineTooLarge = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        forceKillTimer.unref?.();
        return;
      }
      let record: XrayResultRecord;
      try {
        record = JSON.parse(line) as XrayResultRecord;
      } catch {
        profileStats.unparsedResultCount++;
        return;
      }

      profileStats.testedCount++;
      const status = String(record.status ?? "failed").toLowerCase();
      if (status === "passed") {
        profileStats.passedCount++;
      } else if (status === "semi-passed" || status === "semi_passed") {
        profileStats.semiPassedCount++;
      } else {
        profileStats.failedCount++;
        const kind = normalizeFailureKind(record.failureKind);
        profileStats.failureKinds[kind] = (profileStats.failureKinds[kind] ?? 0) + 1;
      }

      const endpoints = Array.isArray(record.endpoints) ? record.endpoints : [];
      for (const endpointValue of endpoints) {
        if (!endpointValue || typeof endpointValue !== "object") continue;
        const endpoint = endpointValue as Record<string, unknown>;
        const label = getEndpointLabel(endpoint);
        const count = profileStats.endpoints[label] ?? {
          total: 0,
          succeeded: 0,
          failed: 0,
          timedOut: 0,
        };
        count.total++;
        const outcome = String(endpoint.outcome ?? "").toLowerCase();
        if (outcome === "success" || outcome === "passed" || outcome === "ok") {
          count.succeeded++;
        } else {
          count.failed++;
          const reason = String(endpoint.reason ?? "").toLowerCase();
          if (reason.includes("timeout") || outcome.includes("timeout")) {
            count.timedOut++;
          }
        }
        profileStats.endpoints[label] = count;
      }

      if (status === "passed" && !profileStats.firstPassed) {
        const link = typeof record.link === "string" ? record.link : "";
        const endpointCount = Number(record.totalCount) || endpoints.length;
        const successCount = Number(record.successCount) || endpoints.filter(
          (endpoint) =>
            endpoint &&
            typeof endpoint === "object" &&
            ["success", "passed", "ok"].includes(
              String((endpoint as Record<string, unknown>).outcome ?? "").toLowerCase(),
            ),
        ).length;
        profileStats.firstPassed = {
          id: link ? configFingerprint(link) : "unknown",
          exitIp: normalizeOptionalString(record.ip),
          country: normalizeOptionalString(record.location),
          delayMs: Number.isFinite(Number(record.delay)) && Number(record.delay) >= 0
            ? Number(record.delay)
            : undefined,
          succeededEndpoints: successCount,
          totalEndpoints: endpointCount,
        };
        if (link && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(link)) {
          firstConfig = link;
        }
      }

      progressRecords++;
      if (progressRecords % 50 === 0) publish();
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      if (Buffer.byteLength(stdoutBuffer, "utf8") > MAX_JSONL_LINE_BYTES && !stdoutBuffer.includes("\n")) {
        lineTooLarge = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        forceKillTimer.unref?.();
        return;
      }
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        consumeJsonlLine(line);
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const merged = stderrSummary + chunk;
      stderrSummary = merged.slice(-32_768);
    });

    child.once("error", (error: NodeJS.ErrnoException) => finish(null, error));
    child.once("close", (code) => {
      if (stdoutBuffer.trim()) consumeJsonlLine(stdoutBuffer);
      finish(code);
    });

    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        profileStats.error = "xray-input-error";
      }
    });
    child.stdin.end(configs.join("\n"));
  });
}

function getEndpointLabel(endpoint: Record<string, unknown>): string {
  if (typeof endpoint.label === "string" && endpoint.label.trim()) {
    return endpoint.label.trim().slice(0, 80);
  }
  if (typeof endpoint.url === "string") {
    try {
      return new URL(endpoint.url).hostname;
    } catch {
      return "unknown-endpoint";
    }
  }
  return "unknown-endpoint";
}

function normalizeFailureKind(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "unknown";
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || value === "null") return undefined;
  return value.trim().slice(0, 80);
}

function configFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function cloneDiagnostics(report: VpnDiagnostics): VpnDiagnostics {
  return JSON.parse(JSON.stringify(report)) as VpnDiagnostics;
}

async function loadPersistedDiagnostics(): Promise<void> {
  if (diagnosticsLoaded) return;
  diagnosticsLoaded = true;
  try {
    const text = await readFile(STATUS_FILE_PATH, "utf8");
    const parsed = JSON.parse(text) as VpnDiagnostics;
    if (parsed && typeof parsed.runId === "string" && Array.isArray(parsed.sources)) {
      currentDiagnostics = parsed;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("[VPN] Could not load saved diagnostics.", {
        error: (error as NodeJS.ErrnoException).code ?? "read-error",
      });
    }
  }
}

function persistDiagnostics(report: VpnDiagnostics): Promise<void> {
  const snapshot = cloneDiagnostics(report);
  persistQueue = persistQueue
    .then(async () => {
      await mkdir(dirname(STATUS_FILE_PATH), { recursive: true });
      const temporaryPath = STATUS_FILE_PATH + "." + process.pid + ".tmp";
      await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2), "utf8");
      await rename(temporaryPath, STATUS_FILE_PATH);
    })
    .catch((error) => {
      logger.warn("[VPN] Could not persist diagnostics.", {
        error: (error as NodeJS.ErrnoException).code ?? "write-error",
      });
    });
  return persistQueue;
}
