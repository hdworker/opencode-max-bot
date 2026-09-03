import type { MaxCallback, MaxMessage, MaxUpdate, SendMessageBody } from "./client.js";
import { maxClient } from "./client.js";

export interface ConversationAddress {
  chatId: number;
  userId: number;
}

export type InboundMaxUpdate =
  | { kind: "message"; address: ConversationAddress; message: MaxMessage; text: string }
  | { kind: "callback"; address: ConversationAddress; callback: MaxCallback; payload: string }
  | { kind: "bot_started"; address: ConversationAddress };

function callbackUserId(update: MaxUpdate, callback: MaxCallback): number {
  return (
    callback.user?.user_id ??
    callback.sender?.user_id ??
    update.user?.user_id ??
    update.message?.sender?.user_id ??
    0
  );
}

function updateChatId(update: MaxUpdate, userId: number): number {
  return update.chat_id ?? update.message?.recipient?.chat_id ?? userId;
}

export function normalizeMaxUpdate(update: MaxUpdate): InboundMaxUpdate | null {
  if (update.update_type === "message_created") {
    const message = update.message;
    const userId = message?.sender?.user_id;
    if (!message || !userId || message.sender?.is_bot) return null;
    return {
      kind: "message",
      address: { userId, chatId: updateChatId(update, userId) },
      message,
      text: message.body?.text ?? "",
    };
  }

  if (update.update_type === "message_callback") {
    const callback = update.callback;
    if (!callback) return null;
    const userId = callbackUserId(update, callback);
    return {
      kind: "callback",
      address: { userId, chatId: updateChatId(update, userId) },
      callback,
      payload: callback.payload,
    };
  }

  if (update.update_type === "bot_started" && update.user) {
    const userId = update.user.user_id;
    return { kind: "bot_started", address: { userId, chatId: updateChatId(update, userId) } };
  }

  return null;
}

export class MaxTransport {
  async reply(address: ConversationAddress, body: SendMessageBody): Promise<MaxMessage> {
    return maxClient.sendMessageToChat(address.chatId, body);
  }

  async acknowledge(
    callbackId: string,
    notification?: string,
    message?: {
      text?: string;
      format?: "markdown" | "html";
      attachments?: SendMessageBody["attachments"];
    },
  ): Promise<void> {
    await maxClient.answerCallback(callbackId, notification, message);
  }
}
