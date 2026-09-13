import { afterEach, describe, expect, it } from "vitest";
import { promptOperationManager } from "../src/max/prompt-operation.js";

afterEach(() => {
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
});
