import { afterEach, describe, expect, it, vi } from "vitest";
import { promptOperationManager } from "../src/max/prompt-operation.js";

afterEach(() => {
  vi.useRealTimers();
  promptOperationManager.cancel(101);
  promptOperationManager.cancel(202);
});

describe("prompt operation isolation", () => {
  it("blocks a second chat from sending to the same session", () => {
    const controller = promptOperationManager.start(101, "session-1");

    expect(promptOperationManager.isSessionActive("session-1")).toBe(true);
    expect(promptOperationManager.isSessionActive("session-2")).toBe(false);

    promptOperationManager.clear(101, controller);
    expect(promptOperationManager.isSessionActive("session-1")).toBe(false);
  });

  it("does not clear a newer operation when an older one finishes", () => {
    const first = promptOperationManager.start(101, "session-1");
    const second = promptOperationManager.start(101, "session-2");

    promptOperationManager.clear(101, first);

    expect(promptOperationManager.isSessionActive("session-1")).toBe(false);
    expect(promptOperationManager.isSessionActive("session-2")).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("expires an operation through its watchdog", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    promptOperationManager.start(101, "session-1", "/project", onTimeout, 1000);
    vi.advanceTimersByTime(1000);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(promptOperationManager.isSessionActive("session-1")).toBe(false);
  });

  it("completes a session only once", () => {
    const controller = promptOperationManager.start(101, "session-1");

    expect(promptOperationManager.completeBySession("session-1", 101)?.controller).toBe(controller);
    expect(promptOperationManager.completeBySession("session-1", 101)).toBeNull();
  });

  it("claims finalization only once while retaining the operation for cleanup", () => {
    const controller = promptOperationManager.start(101, "session-1", "/project");

    expect(promptOperationManager.beginFinalization("session-1", 101)?.controller).toBe(controller);
    expect(promptOperationManager.beginFinalization("session-1", 101)).toBeNull();
    expect(promptOperationManager.isSessionActive("session-1")).toBe(true);

    promptOperationManager.clear(101, controller);
    expect(promptOperationManager.isSessionActive("session-1")).toBe(false);
  });

  it("exposes only accepted operations for reconnect reconciliation", () => {
    const controller = promptOperationManager.start(101, "session-1", "/project");
    expect(promptOperationManager.getByDirectory("/project")).toHaveLength(0);

    expect(promptOperationManager.markAccepted(101, controller)).toBe(true);
    expect(promptOperationManager.getByDirectory("/project")).toHaveLength(1);
  });
});
