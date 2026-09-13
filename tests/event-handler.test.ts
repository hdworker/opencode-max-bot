import { describe, expect, it } from "vitest";
import { getLatestAssistantText } from "../src/max/event-handler.js";

describe("OpenCode completion event response", () => {
  it("selects the latest assistant text and ignores reasoning/tool parts", () => {
    expect(
      getLatestAssistantText([
        {
          type: "assistant",
          time: { created: 1 },
          content: [{ type: "text", text: "old" }],
        },
        {
          type: "assistant",
          time: { created: 2 },
          content: [
            { type: "reasoning", text: "internal" },
            { type: "text", text: "first" },
            { type: "text", text: "second" },
            { type: "tool", text: "ignored" },
          ],
        },
      ]),
    ).toBe("first\n\nsecond");
  });

  it("returns empty text when no assistant response exists", () => {
    expect(getLatestAssistantText([{ type: "user", text: "hello" }])).toBe("");
  });
});
