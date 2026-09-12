import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface MaxApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface SendMessageBody {
  text?: string;
  format?: "markdown" | "html";
  attachments?: Attachment[];
  reply_markup?: {
    inline_keyboard?: Array<Array<{ type: string; text: string; payload: string }>>;
  };
  disable_link_preview?: boolean;
  notify?: boolean;
}

export interface Attachment {
  type: string;
  payload?: Record<string, unknown>;
}

export interface InlineKeyboardAttachment extends Attachment {
  type: "inline_keyboard";
  payload: {
    buttons: KeyboardButton[][];
  };
}

export type KeyboardButton =
  | CallbackButton
  | LinkButton
  | MessageButton
  | RequestContactButton
  | RequestGeoLocationButton
  | OpenAppButton
  | ClipboardButton;

export interface CallbackButton {
  type: "callback";
  text: string;
  payload: string;
}

export interface LinkButton {
  type: "link";
  text: string;
  url: string;
}

export interface MessageButton {
  type: "message";
  text: string;
  payload: string;
}

export interface RequestContactButton {
  type: "request_contact";
  text: string;
}

export interface RequestGeoLocationButton {
  type: "request_geo_location";
  text: string;
}

export interface OpenAppButton {
  type: "open_app";
  text: string;
  mini_app?: Record<string, unknown>;
}

export interface ClipboardButton {
  type: "clipboard";
  text: string;
  payload: string;
}

export interface MaxMessage {
  message_id: string;
  sender?: MaxUser;
  recipient: MaxRecipient;
  body: MaxMessageBody;
  stat: MaxMessageStat;
  link?: MaxMessageLink;
  construction?: unknown;
}

export interface MaxMessageBody {
  mid: string;
  seq: number;
  text?: string;
  attachments?: unknown[];
  markups?: unknown[];
}

export interface MaxMessageStat {
  views?: number;
  redirects?: number;
}

export interface MaxMessageLink {
  type: string;
  title?: string;
  description?: string;
  image?: MaxImage;
  button?: MaxLinkButton;
  navigation?: unknown;
}

export interface MaxLinkButton {
  type: string;
  text: string;
  payload?: string;
}

export interface MaxImage {
  url: string;
  width: number;
  height: number;
}

export interface MaxRecipient {
  chat_id?: number;
  chat_type?: "dialog" | "group" | "channel";
}

export interface MaxUser {
  user_id: number;
  name: string;
  username?: string;
  avatar?: MaxImage;
  last_activity_time: number;
  is_bot: boolean;
}

export interface MaxBotInfo {
  user_id: number;
  name: string;
  username: string;
  is_bot: true;
  last_activity_time: number;
}

export interface MaxUpdate {
  update_id: string;
  update_type: UpdateType;
  chat_id?: number;
  message?: MaxMessage;
  user?: MaxUser;
  chat?: MaxChat;
  callback?: MaxCallback;
  payload?: Record<string, unknown>;
}

export type UpdateType =
  | "message_created"
  | "message_edited"
  | "message_removed"
  | "message_callback"
  | "bot_started"
  | "bot_stopped"
  | "bot_added"
  | "bot_removed"
  | "user_added"
  | "user_removed"
  | "chat_title_changed"
  | "message_chat_created"
  | "message_construction_request"
  | "message_constructed";

export interface MaxCallback {
  callback_id: string;
  payload: string;
  user?: MaxUser;
  sender?: MaxUser;
  message?: MaxMessage;
}

export interface MaxChat {
  chat_id: number;
  chat_type: "group" | "channel";
  title?: string;
  description?: string;
  avatar?: MaxImage;
  chat_link?: string;
}

export interface MaxGetUpdatesResponse {
  updates: MaxUpdate[];
  marker?: string;
}

export interface UploadUrlResponse {
  url: string;
}

export interface UploadFileResponse {
  file_url: string;
  tokens?: string[];
}

export type SenderAction =
  | "typing_on"
  | "sending_photo"
  | "sending_video"
  | "sending_audio"
  | "sending_file"
  | "mark_seen";

class MaxRateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Rate limited, retry after ${retryAfterMs}ms`);
  }
}

class MaxRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class MaxClient {
  private token: string;
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(token?: string) {
    this.token = token || config.max.token;
    this.baseUrl = config.max.apiUrl.replace(/\/$/, "");
    this.defaultHeaders = {
      Authorization: this.token,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retries = 3,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    // Retrying a mutating request can duplicate a message when the server
    // accepted it but the response was lost. Only GET requests are safe to
    // retry automatically; callers can explicitly retry an operation when
    // they have an idempotency key or otherwise know it is safe.
    const maxAttempts = method === "GET" ? retries : 1;
    const timeoutMs = path.startsWith("/updates?") ? 40_000 : 15_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers: {
            ...this.defaultHeaders,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const retryMs = retryAfter ? Number(retryAfter) * 1000 : 1000;
          logger.warn(`[MaxClient] Rate limited, waiting ${retryMs}ms`);
          if (attempt < maxAttempts) {
            await sleep(retryMs);
            continue;
          }
          throw new MaxRateLimitError(retryMs);
        }

        if (!response.ok) {
          const text = await response.text();
          throw new MaxRequestError(
            `Max API error ${response.status}: ${text}`,
            response.status >= 500,
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof MaxRateLimitError) throw error;
        if (error instanceof MaxRequestError && !error.retryable) throw error;
        if (attempt === maxAttempts) throw error;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        logger.warn(`[MaxClient] Request failed (attempt ${attempt}), retrying in ${delay}ms`);
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("MaxClient: max retries exceeded");
  }

  private async requestMultipart(
    url: string,
    file: Blob,
    filename: string,
  ): Promise<UploadFileResponse> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.token,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Max upload error ${response.status}: ${text}`);
    }

    return (await response.json()) as UploadFileResponse;
  }

  async getMe(): Promise<MaxBotInfo> {
    const response = await this.request<{
      user_id: number;
      name: string;
      username: string;
      is_bot: boolean;
      last_activity_time: number;
    }>("GET", "/me");
    return { ...response, is_bot: true as const };
  }

  async sendMessage(userId: number, body: SendMessageBody): Promise<MaxMessage> {
    const response = await this.request<{ message: MaxMessage }>(
      "POST",
      `/messages?user_id=${userId}`,
      body as unknown as Record<string, unknown>,
    );
    return response.message;
  }

  async sendMessageToChat(chatId: number, body: SendMessageBody): Promise<MaxMessage> {
    const response = await this.request<{ message: MaxMessage }>(
      "POST",
      `/messages?chat_id=${chatId}`,
      body as unknown as Record<string, unknown>,
    );
    return response.message;
  }

  async editMessage(messageId: string, body: Partial<SendMessageBody>): Promise<MaxMessage> {
    const response = await this.request<{ message: MaxMessage }>(
      "PUT",
      `/messages/${messageId}`,
      body as unknown as Record<string, unknown>,
    );
    return response.message;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.request("DELETE", `/messages/${messageId}`);
  }

  async answerCallback(
    callbackId: string,
    notification?: string,
    message?: { text?: string; format?: "markdown" | "html"; attachments?: Attachment[] },
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    if (notification || !message) {
      body.notification = notification || "✅";
    }

    if (message) {
      body.message = message;
    }

    await this.request("POST", `/answers?callback_id=${callbackId}`, body);
  }

  async sendAction(chatId: number, action: SenderAction): Promise<void> {
    await this.request("POST", `/chats/${chatId}/actions`, {
      action,
    });
  }

  async getUpdates(marker?: string, timeout = 30): Promise<MaxGetUpdatesResponse> {
    const params = new URLSearchParams();
    if (marker) params.set("marker", marker);
    params.set("timeout", String(timeout));

    return this.request<MaxGetUpdatesResponse>("GET", `/updates?${params.toString()}`);
  }

  async getUploadUrl(type: "image" | "video" | "audio" | "file"): Promise<UploadUrlResponse> {
    return this.request<UploadUrlResponse>("POST", "/uploads", { type });
  }

  async uploadFile(uploadUrl: string, file: Blob, filename: string): Promise<UploadFileResponse> {
    return this.requestMultipart(uploadUrl, file, filename);
  }

  async uploadImage(data: Buffer, filename: string): Promise<Attachment> {
    const { url } = await this.getUploadUrl("image");
    const blob = new Blob([new Uint8Array(data)]);
    const payload = await this.uploadFile(url, blob, filename);
    return {
      type: "image",
      payload: {
        photos: [
          {
            url: payload.file_url,
            token: payload.tokens?.[0],
          },
        ],
      },
    };
  }

  async uploadFileAttachment(data: Buffer, filename: string): Promise<Attachment> {
    const { url } = await this.getUploadUrl("file");
    const blob = new Blob([new Uint8Array(data)]);
    const payload = await this.uploadFile(url, blob, filename);
    return {
      type: "file",
      payload: {
        url: payload.file_url,
        token: payload.tokens?.[0],
        name: filename,
      },
    };
  }

  async uploadVideo(data: Buffer, filename: string): Promise<Attachment> {
    const { url } = await this.getUploadUrl("video");
    const blob = new Blob([new Uint8Array(data)]);
    const payload = await this.uploadFile(url, blob, filename);
    return {
      type: "video",
      payload: {
        url: payload.file_url,
        token: payload.tokens?.[0],
      },
    };
  }

  async uploadAudio(data: Buffer, filename: string): Promise<Attachment> {
    const { url } = await this.getUploadUrl("audio");
    const blob = new Blob([new Uint8Array(data)]);
    const payload = await this.uploadFile(url, blob, filename);
    return {
      type: "audio",
      payload: {
        url: payload.file_url,
        token: payload.tokens?.[0],
      },
    };
  }

  async getChat(chatId: number): Promise<MaxChat> {
    return this.request<MaxChat>("GET", `/chats/${chatId}`);
  }

  async deleteWebhook(): Promise<void> {
    await this.request("DELETE", "/subscriptions");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const maxClient = new MaxClient();
