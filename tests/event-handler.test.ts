import { afterEach, describe, expect, it, vi } from "vitest";
import { getLatestAssistantText, handleEvent } from "../src/max/event-handler.js";
import { promptOperationManager } from "../src/max/prompt-operation.js";
import { opencodeClient } from "../src/opencode/client.js";
import type { MaxBot } from "../src/max/bot.js";

const bot = {
  sendMessage: vi.fn().mockResolvedValue({ message_id: "1" }),
} as unknown as MaxBot;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  promptOperationManager.cancel(501);
});

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

  it("extracts text from the OpenCode session message shape", () => {
    expect(
      getLatestAssistantText([
        {
          info: {
            role: "assistant",
            time: { created: 1 },
          },
          parts: [
            { type: "reasoning", text: "internal" },
            { type: "text", text: "Разобрал структуру." },
            { type: "tool", text: "ignored" },
            { type: "text", text: "Вот план." },
          ],
        },
      ]),
    ).toBe("Разобрал структуру.\n\nВот план.");
  });

  it("handles session.idle once, sends the final answer, and clears the operation", async () => {
    const controller = promptOperationManager.start(501, "session-1", "/project");
    vi.spyOn(opencodeClient.session, "messages").mockResolvedValue({
      data: [
        {
          info: {
            role: "assistant",
            time: { created: 2 },
          },
          parts: [{ type: "text", text: "final answer" }],
        },
      ],
    } as never);

    const event = {
      id: "idle-1",
      type: "session.idle",
      properties: { sessionID: "session-1" },
    } as never;

    await handleEvent(bot, 501, event);
    await handleEvent(bot, 501, event);

    expect(opencodeClient.session.messages).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledOnce();
    expect(bot.sendMessage).toHaveBeenCalledWith(
      501,
      expect.objectContaining({ text: "final answer", format: "markdown" }),
    );
    expect(promptOperationManager.isSessionActive("session-1")).toBe(false);
    expect(controller.signal.aborted).toBe(false);
  });

  it("clears the operation even when the completed session has no assistant text", async () => {
    const controller = promptOperationManager.start(501, "session-empty", "/project");
    vi.spyOn(opencodeClient.session, "messages").mockResolvedValue({ data: [] } as never);

    await handleEvent(bot, 501, {
      id: "idle-empty",
      type: "session.idle",
      properties: { sessionID: "session-empty" },
    } as never);

    expect(promptOperationManager.isSessionActive("session-empty")).toBe(false);
    expect(controller.signal.aborted).toBe(false);
    expect(bot.sendMessage).toHaveBeenCalledWith(
      501,
      expect.objectContaining({ text: "✅ Готово. Панель сессии:" }),
    );
  });

  it("retries a transient final-message failure and still sends one answer", async () => {
    vi.useFakeTimers();
    promptOperationManager.start(501, "session-retry", "/project");
    const messages = vi.spyOn(opencodeClient.session, "messages");
    messages
      .mockRejectedValueOnce(new Error("temporary disconnect"))
      .mockResolvedValueOnce({
        data: [
          {
            type: "assistant",
            time: { created: 1 },
            content: [{ type: "text", text: "recovered answer" }],
          },
        ],
      } as never);

    const completion = handleEvent(bot, 501, {
      id: "idle-retry",
      type: "session.idle",
      properties: { sessionID: "session-retry" },
    } as never);
    await vi.advanceTimersByTimeAsync(1_000);
    await completion;

    expect(messages).toHaveBeenCalledTimes(2);
    expect(bot.sendMessage).toHaveBeenCalledWith(
      501,
      expect.objectContaining({ text: "recovered answer", format: "markdown" }),
    );
    expect(promptOperationManager.isSessionActive("session-retry")).toBe(false);
  });
});
