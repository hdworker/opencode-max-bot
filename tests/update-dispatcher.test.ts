import { describe, expect, it } from "vitest";
import type { MaxUpdate } from "../src/max/client.js";
import { MaxUpdateDispatcher } from "../src/max/update-dispatcher.js";

function messageUpdate(text: string, chatId = 42): MaxUpdate {
  return {
    update_id: `${chatId}-${text}`,
    update_type: "message_created",
    chat_id: chatId,
    message: {
      message_id: `${chatId}-${text}`,
      sender: {
        user_id: 7,
        name: "Test User",
        last_activity_time: 0,
        is_bot: false,
      },
      recipient: { chat_id: chatId, chat_type: "dialog" },
      body: { mid: `${chatId}-${text}`, seq: 1, text },
      stat: {},
    },
  };
}

function callbackUpdate(payload: string, chatId = 42): MaxUpdate {
  return {
    update_id: `${chatId}-${payload}`,
    update_type: "message_callback",
    chat_id: chatId,
    callback: {
      callback_id: `${chatId}-${payload}`,
      payload,
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("MaxUpdateDispatcher", () => {
  it("dispatches callbacks while a regular message is still running", async () => {
    const gate = deferred();
    const calls: string[] = [];
    const dispatcher = new MaxUpdateDispatcher();

    dispatcher.dispatch(messageUpdate("prompt"), async () => {
      calls.push("prompt:start");
      await gate.promise;
      calls.push("prompt:end");
    });

    await flush();
    expect(calls).toEqual(["prompt:start"]);

    dispatcher.dispatch(callbackUpdate("perm_allow_request"), async () => {
      calls.push("callback");
    });

    await flush();
    expect(calls).toEqual(["prompt:start", "callback"]);

    gate.resolve();
    await nextTurn();
    expect(calls).toEqual(["prompt:start", "callback", "prompt:end"]);
  });

  it("keeps regular messages ordered within one chat", async () => {
    const gate = deferred();
    const calls: string[] = [];
    const dispatcher = new MaxUpdateDispatcher();

    dispatcher.dispatch(messageUpdate("first"), async () => {
      calls.push("first:start");
      await gate.promise;
      calls.push("first:end");
    });
    dispatcher.dispatch(messageUpdate("second"), async () => {
      calls.push("second");
    });

    await flush();
    expect(calls).toEqual(["first:start"]);

    gate.resolve();
    await nextTurn();
    expect(calls).toEqual(["first:start", "first:end", "second"]);
  });

  it("dispatches commands immediately while a regular message is running", async () => {
    const gate = deferred();
    const calls: string[] = [];
    const dispatcher = new MaxUpdateDispatcher();

    dispatcher.dispatch(messageUpdate("prompt"), async () => {
      calls.push("prompt:start");
      await gate.promise;
    });

    await flush();
    expect(calls).toEqual(["prompt:start"]);

    dispatcher.dispatch(messageUpdate("/abort"), async () => {
      calls.push("command");
    });

    await flush();
    expect(calls).toEqual(["prompt:start", "command"]);
    gate.resolve();
  });
});
