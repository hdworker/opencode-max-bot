import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type VpnStoredProfile = "chatgpt" | "social";
export type VpnStoredState = "active" | "removed" | "unavailable";
export type VpnCheckOutcome = "passed" | "semi-passed" | "failed";

export interface LegacyVpnIssuedRef {
  id: string;
  profile: VpnStoredProfile;
  issuedAt: string;
  exitIp?: string;
  country?: string;
  delayMs?: number;
}

export interface VpnIssuedConfigRecord extends LegacyVpnIssuedRef {
  identity: string;
  state: VpnStoredState;
  config?: string;
  lastCheckedAt?: string;
  lastCheck?: VpnCheckOutcome;
  removedAt?: string;
}

interface VpnIssuedStore {
  version: 1;
  records: VpnIssuedConfigRecord[];
}

const STORE_PATH = join(homedir(), ".opencode-max-bot", "vpn-issued-configs.json");
let store: VpnIssuedStore | undefined;
let loadPromise: Promise<void> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

export class VpnIssuedStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VpnIssuedStoreError";
  }
}

export function vpnConfigId(config: string): string {
  return createHash("sha256").update(config).digest("hex").slice(0, 12);
}

export function vpnConfigIdentity(config: string): string {
  const withoutRemark = config.trim().split("#", 1)[0] ?? config.trim();
  let normalized = withoutRemark;
  try {
    const url = new URL(withoutRemark);
    const params = [...url.searchParams.entries()].sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );
    url.search = "";
    for (const [key, value] of params) url.searchParams.append(key, value);
    normalized = url.toString();
  } catch {
    // Keep the exact link body when the scheme is not understood by URL.
  }
  return createHash("sha256").update(normalized).digest("hex");
}

export function filterPreviouslyIssuedConfigs(
  configs: string[],
  records: VpnIssuedConfigRecord[],
): { configs: string[]; skipped: number } {
  const issuedIds = new Set(records.map((record) => record.id));
  const issuedIdentities = new Set(
    records.map((record) => record.identity).filter((identity) => !identity.startsWith("legacy:")),
  );
  const filtered: string[] = [];
  let skipped = 0;
  for (const config of configs) {
    if (issuedIds.has(vpnConfigId(config)) || issuedIdentities.has(vpnConfigIdentity(config))) {
      skipped++;
    } else {
      filtered.push(config);
    }
  }
  return { configs: filtered, skipped };
}

export async function getVpnIssuedRecords(
  legacyRefs: LegacyVpnIssuedRef[] = [],
): Promise<VpnIssuedConfigRecord[]> {
  await ensureLoaded();
  let changed = false;
  for (const legacy of legacyRefs) {
    if (store!.records.some((record) => record.id === legacy.id)) continue;
    store!.records.push({
      ...legacy,
      identity: "legacy:" + legacy.id,
      state: "unavailable",
    });
    changed = true;
  }
  if (changed) await persistStore();
  return store!.records.map((record) => ({ ...record }));
}

export async function rememberVpnConfig(
  profile: VpnStoredProfile,
  config: string,
  details: Omit<LegacyVpnIssuedRef, "id" | "profile">,
): Promise<boolean> {
  await ensureLoaded();
  const records = store!.records;
  const identity = vpnConfigIdentity(config);
  if (records.some((record) => record.id === vpnConfigId(config) || record.identity === identity)) {
    return false;
  }
  records.push({
    ...details,
    id: vpnConfigId(config),
    identity,
    profile,
    config,
    state: "active",
  });
  await persistStore();
  return true;
}

export async function recoverLegacyVpnConfigs(configs: string[]): Promise<number> {
  await ensureLoaded();
  const byId = new Map(configs.map((config) => [vpnConfigId(config), config]));
  let recovered = 0;
  for (const record of store!.records) {
    if (record.state !== "unavailable") continue;
    const config = byId.get(record.id);
    if (!config) continue;
    record.config = config;
    record.identity = vpnConfigIdentity(config);
    record.state = "active";
    recovered++;
  }
  if (recovered > 0) await persistStore();
  return recovered;
}

export interface VpnRescanUpdate {
  identity: string;
  outcome: VpnCheckOutcome;
}

export interface VpnPruneResult {
  passed: number;
  removed: number;
  untested: number;
}

export function pruneVpnIssuedRecords(
  records: VpnIssuedConfigRecord[],
  profile: VpnStoredProfile,
  updates: VpnRescanUpdate[],
  checkedAt: string,
): { records: VpnIssuedConfigRecord[]; result: VpnPruneResult; changed: boolean } {
  const outcomes = new Map(updates.map((update) => [update.identity, update.outcome]));
  const result: VpnPruneResult = { passed: 0, removed: 0, untested: 0 };
  let changed = false;
  const nextRecords = records.map((source) => {
    const record = { ...source };
    if (record.profile !== profile || record.state !== "active" || !record.config) return record;
    const outcome = outcomes.get(record.identity);
    if (!outcome) {
      result.untested++;
      return record;
    }
    record.lastCheckedAt = checkedAt;
    record.lastCheck = outcome;
    changed = true;
    if (outcome === "passed") {
      result.passed++;
    } else {
      record.state = "removed";
      record.removedAt = checkedAt;
      delete record.config;
      result.removed++;
    }
    return record;
  });
  return { records: nextRecords, result, changed };
}

export async function applyVpnRescanResults(
  profile: VpnStoredProfile,
  updates: VpnRescanUpdate[],
  checkedAt: string,
): Promise<VpnPruneResult> {
  await ensureLoaded();
  const pruned = pruneVpnIssuedRecords(store!.records, profile, updates, checkedAt);
  store!.records = pruned.records;
  if (pruned.changed) await persistStore();
  return pruned.result;
}

async function ensureLoaded(): Promise<void> {
  if (store) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const text = await readFile(STORE_PATH, "utf8");
        const parsed = JSON.parse(text) as VpnIssuedStore;
        if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
          throw new VpnIssuedStoreError("Saved issued VPN config list has an unsupported format.");
        }
        store = parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          store = { version: 1, records: [] };
          return;
        }
        if (error instanceof VpnIssuedStoreError) throw error;
        if (error instanceof SyntaxError) {
          throw new VpnIssuedStoreError(
            "Saved issued VPN config list is damaged; refusing to issue duplicates.",
          );
        }
        throw new VpnIssuedStoreError("Could not read the saved issued VPN config list.");
      }
    })();
  }
  try {
    await loadPromise;
  } catch (error) {
    loadPromise = undefined;
    throw error;
  }
}

function persistStore(): Promise<void> {
  const snapshot: VpnIssuedStore = JSON.parse(JSON.stringify(store)) as VpnIssuedStore;
  const write = writeQueue.then(async () => {
    await mkdir(dirname(STORE_PATH), { recursive: true, mode: 0o700 });
    const temporaryPath = STORE_PATH + "." + process.pid + ".tmp";
    await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, STORE_PATH);
  });
  writeQueue = write.catch(() => undefined);
  return write;
}
