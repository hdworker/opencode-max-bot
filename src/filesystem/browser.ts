import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface BrowserEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface BrowserView {
  currentPath: string;
  displayPath: string;
  entries: BrowserEntry[];
  canGoUp: boolean;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function normalize(value: string): string {
  const resolved = path.resolve(expandHome(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function getBrowserRoots(raw = process.env.OPEN_BROWSER_ROOTS): string[] {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (values.length > 0 ? values : [os.homedir()]).map(normalize);
}

export async function isAllowedPath(targetPath: string): Promise<boolean> {
  const candidate = normalize(targetPath);
  let resolved = candidate;
  try {
    resolved = normalize(await fs.realpath(candidate));
  } catch {
    return false;
  }
  return getBrowserRoots().some((root) => isWithin(resolved, root));
}

export function displayPath(targetPath: string): string {
  const home = normalize(os.homedir());
  const resolved = normalize(targetPath);
  if (resolved === home) return "~";
  if (isWithin(resolved, home)) return `~${path.sep}${path.relative(home, resolved)}`;
  return targetPath;
}

export async function listDirectory(targetPath: string): Promise<BrowserView> {
  const currentPath = normalize(targetPath);
  if (!(await isAllowedPath(currentPath))) throw new Error("Доступ к этой папке запрещён.");

  const items = await fs.readdir(currentPath, { withFileTypes: true });
  const entries: BrowserEntry[] = [];
  for (const item of items) {
    if (item.name === "." || item.name === "..") continue;
    const itemPath = path.join(currentPath, item.name);
    if (item.isDirectory()) {
      entries.push({ name: item.name, path: itemPath, type: "directory" });
    } else if (item.isFile()) {
      const stat = await fs.stat(itemPath).catch(() => null);
      entries.push({ name: item.name, path: itemPath, type: "file", size: stat?.size });
    }
  }

  entries.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  const root = path.parse(currentPath).root;
  const canGoUp = getBrowserRoots().some((allowed) => {
    const parent = path.dirname(currentPath);
    return currentPath !== root && isWithin(parent, allowed);
  });
  return {
    currentPath,
    displayPath: displayPath(currentPath),
    entries,
    canGoUp,
  };
}

export async function getFileInfo(targetPath: string): Promise<BrowserEntry> {
  const currentPath = normalize(targetPath);
  if (!(await isAllowedPath(currentPath))) throw new Error("Доступ к этому файлу запрещён.");
  const stat = await fs.stat(currentPath);
  if (!stat.isFile()) throw new Error("Это не файл.");
  return { name: path.basename(currentPath), path: currentPath, type: "file", size: stat.size };
}

export function getParent(targetPath: string): string {
  return path.dirname(normalize(targetPath));
}
