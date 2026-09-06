import { afterEach, describe, expect, it } from "vitest";
import { interactionManager } from "../src/interaction/manager.js";

afterEach(() => {
  interactionManager.clear(1);
  interactionManager.clear(2);
});

describe("question interactions", () => {
  it("keeps custom input mode explicit and scoped to the chat", () => {
    expect(interactionManager.start(1, "question_custom", "session-1")).toBe(true);
    expect(interactionManager.isKind(1, "question_custom")).toBe(true);
    expect(interactionManager.isKind(2, "question_custom")).toBe(false);
  });

  it("can be cleared after a failed or cancelled answer", () => {
    interactionManager.start(1, "question_custom", "session-1");

    interactionManager.clear(1);

    expect(interactionManager.isActive(1)).toBe(false);
    expect(interactionManager.start(1, "commands", "session-1")).toBe(true);
  });
});
