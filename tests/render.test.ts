import { describe, expect, it } from "vitest";
import { chunkText, renderText } from "../src/max/render/pipeline.js";

describe("MAX markdown rendering", () => {
  it("keeps headings, lists, quotes, and fenced code readable", () => {
    expect(renderText("# Result\n\n- one\n- two\n\n> note\n\n```ts\nconst ok = true;\n```")).toBe(
      "**Result**\n\n- one\n- two\n\n> note\n\n```ts\nconst ok = true;\n```",
    );
  });

  it("splits long messages without losing content", () => {
    const text = "first\n\nsecond\n\nthird";
    const chunks = chunkText(text, 10);

    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
  });
});
