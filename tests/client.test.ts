import { afterEach, describe, expect, it, vi } from "vitest";
import { MaxClient, MAX_MESSAGE_TEXT_LENGTH } from "../src/max/client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MAX client retry policy", () => {
  it("does not retry a message POST after a network error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const client = new MaxClient("test-token");

    await expect(client.sendMessage(42, { text: "once" })).rejects.toThrow("network");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized outbound message before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const client = new MaxClient("test-token");

    await expect(
      client.sendMessage(42, { text: "x".repeat(MAX_MESSAGE_TEXT_LENGTH + 1) }),
    ).rejects.toThrow("exceeds");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
