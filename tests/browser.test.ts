import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getBrowserRoots, isAllowedPath, listDirectory } from "../src/filesystem/browser.js";

const temporaryDirectories: string[] = [];
const originalBrowserRoots = process.env.OPEN_BROWSER_ROOTS;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  if (originalBrowserRoots === undefined) delete process.env.OPEN_BROWSER_ROOTS;
  else process.env.OPEN_BROWSER_ROOTS = originalBrowserRoots;
});

describe("filesystem browser", () => {
  it("lists directories and files under a configured root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "max-bot-browser-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "README.md"), "hello");
    process.env.OPEN_BROWSER_ROOTS = root;

    const view = await listDirectory(root);

    expect(view.entries.map((entry) => [entry.name, entry.type])).toEqual([
      ["src", "directory"],
      ["README.md", "file"],
    ]);
    expect(view.canGoUp).toBe(false);
  });

  it("rejects paths outside configured roots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "max-bot-browser-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "max-bot-outside-"));
    temporaryDirectories.push(root, outside);
    process.env.OPEN_BROWSER_ROOTS = root;

    expect(getBrowserRoots(root)).toEqual([
      process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root),
    ]);
    expect(await isAllowedPath(outside)).toBe(false);
  });
});
