import { describe, expect, it } from "vitest";
import { buildPromptAcceptedStatus } from "../src/max/handlers/prompt.js";

describe("MAX prompt presentation", () => {
  it("keeps the accepted status message free of session controls", () => {
    expect(buildPromptAcceptedStatus()).toEqual({
      text: "⏳ Запрос принят. OpenCode выполняет задачу...",
    });
    expect("attachments" in buildPromptAcceptedStatus()).toBe(false);
  });
});
