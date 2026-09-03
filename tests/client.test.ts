import { afterEach, describe, expect, it, vi } from "vitest";
import { MaxClient } from "../src/max/client.js";

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
});
