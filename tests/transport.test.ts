import { describe, expect, it } from "vitest";
import { normalizeMaxUpdate } from "../src/max/transport.js";

describe("MAX transport normalization", () => {
  it("uses callback.user and the sibling message for callback updates", () => {
    const inbound = normalizeMaxUpdate({
      update_id: "1",
      update_type: "message_callback",
      callback: {
        callback_id: "callback-1",
        payload: "select_session:session-1",
        user: { user_id: 42, name: "Owner", last_activity_time: 0, is_bot: false },
      },
      message: {
        message_id: "message-1",
        recipient: { chat_id: 77, chat_type: "dialog" },
        body: { mid: "m", seq: 1 },
        stat: {},
      },
    });

    expect(inbound).toMatchObject({
      kind: "callback",
      address: { userId: 42, chatId: 77 },
      payload: "select_session:session-1",
    });
  });

  it("keeps a message reply in the update chat", () => {
    const inbound = normalizeMaxUpdate({
      update_id: "2",
      update_type: "message_created",
      chat_id: 99,
      message: {
        message_id: "message-2",
        sender: { user_id: 42, name: "Owner", last_activity_time: 0, is_bot: false },
        recipient: { chat_type: "dialog" },
        body: { mid: "m", seq: 1, text: "/projects" },
        stat: {},
      },
    });

    expect(inbound).toMatchObject({
      kind: "message",
      address: { userId: 42, chatId: 99 },
      text: "/projects",
    });
  });
});
