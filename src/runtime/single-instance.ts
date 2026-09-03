import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK_FILE = ".opencode-max-bot.lock";

export class SingleInstanceLock {
  private descriptor: number | null = null;
  private readonly path = join(process.cwd(), LOCK_FILE);

  acquire(): void {
    try {
      this.descriptor = openSync(this.path, "wx");
      writeFileSync(this.descriptor, String(process.pid));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const ownerPid = Number.parseInt(readFileSync(this.path, "utf8").trim(), 10);
      if (Number.isInteger(ownerPid) && isProcessAlive(ownerPid)) {
        throw new Error(`Another bot instance is already running (pid=${ownerPid})`);
      }

      unlinkSync(this.path);
      this.descriptor = openSync(this.path, "wx");
      writeFileSync(this.descriptor, String(process.pid));
    }
  }

  release(): void {
    if (this.descriptor === null) return;
    closeSync(this.descriptor);
    this.descriptor = null;
    if (existsSync(this.path)) unlinkSync(this.path);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
