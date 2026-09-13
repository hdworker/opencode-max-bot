import { describe, expect, it } from "vitest";
import {
  classifyMaxApiFailure,
  classifyPromptFailure,
  promptFailureMessage,
} from "../src/max/prompt-errors.js";
import { hasLargeSessionContext, MAX_SESSION_INPUT_TOKENS } from "../src/max/session-guard.js";
import { isPromptTooLong, MAX_PROMPT_LENGTH } from "../src/max/prompt-input.js";

describe("prompt failure classification", () => {
  it("recognizes OpenCode availability and timeout failures through causes", () => {
    const refused = new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const timeout = new Error("fetch failed", {
      cause: { code: "UND_ERR_HEADERS_TIMEOUT" },
    });

    expect(classifyPromptFailure(refused)).toBe("opencode-unavailable");
    expect(classifyPromptFailure(timeout)).toBe("opencode-timeout");
    expect(classifyMaxApiFailure(timeout)).toBe("max-timeout");
    expect(promptFailureMessage("opencode-timeout")).toContain("не ответил вовремя");
  });

  it("recognizes a disconnected socket", () => {
    expect(
      classifyPromptFailure(new Error("fetch failed", { cause: { name: "SocketError" } })),
    ).toBe("opencode-disconnected");
  });
});

describe("prompt input and session guards", () => {
  it("rejects only text beyond the MAX boundary", () => {
    expect(isPromptTooLong("x".repeat(MAX_PROMPT_LENGTH))).toBe(false);
    expect(isPromptTooLong("x".repeat(MAX_PROMPT_LENGTH + 1))).toBe(true);
  });

  it("detects a large assistant context without requiring a concrete SDK type", () => {
    expect(hasLargeSessionContext([{ tokens: { input: MAX_SESSION_INPUT_TOKENS } }])).toBe(true);
    expect(hasLargeSessionContext([{ tokens: { input: MAX_SESSION_INPUT_TOKENS - 1 } }])).toBe(
      false,
    );
  });
});
