import type { Event } from "@opencode-ai/sdk/v2";
import { opencodeClient } from "./client.js";
import { isExpectedOpencodeUnavailableError } from "../utils/opencode-error.js";
import { logger } from "../utils/logger.js";

export type EventCallback = (event: Event) => void | Promise<void>;

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 15_000;
const IDLE_TIMEOUT_MS = 30_000;

function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_DELAY_MS);
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const onAbort = () => finish(false);
    const timeout = setTimeout(() => finish(true), ms);
    const finish = (result: boolean) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readWithTimeout(
  stream: AsyncGenerator<Event, unknown, unknown>,
  signal: AbortSignal,
): Promise<IteratorResult<Event, unknown> | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve(null);
    const onAbort = () => finish(null);
    const timeout = setTimeout(
      () => reject(new Error("OpenCode event stream idle timeout")),
      IDLE_TIMEOUT_MS,
    );
    const finish = (value: IteratorResult<Event, unknown> | null) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    stream.next().then(finish, reject);
  });
}

/** A listener owns exactly one OpenCode Project directory. */
export class OpenCodeEventListener {
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;

  start(directory: string, callback: EventCallback): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.controller = controller;
    this.running = this.run(directory, callback, controller);
    return this.running;
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
    this.running = null;
  }

  private async run(
    directory: string,
    callback: EventCallback,
    controller: AbortController,
  ): Promise<void> {
    let attempt = 0;

    while (!controller.signal.aborted) {
      try {
        const result = await opencodeClient.event.subscribe(
          { directory },
          { signal: controller.signal },
        );
        if (!result.stream) throw new Error("OpenCode event subscription returned no stream");
        attempt = 0;

        while (!controller.signal.aborted) {
          const next = await readWithTimeout(result.stream, controller.signal);
          if (!next || next.done) break;
          await callback(next.value);
        }
      } catch (error) {
        if (controller.signal.aborted) break;
        attempt++;
        const delay = reconnectDelay(attempt);
        const level = isExpectedOpencodeUnavailableError(error) ? "warn" : "error";
        logger[level](
          `[OpenCodeEvents] ${directory} disconnected; reconnecting in ${delay}ms (attempt=${attempt})`,
          error,
        );
        if (!(await wait(delay, controller.signal))) break;
      }
    }
  }
}
