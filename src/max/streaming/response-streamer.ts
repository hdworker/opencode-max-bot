import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { chunkText, renderText } from "../render/pipeline.js";

interface StreamedMessage {
  messageId: string;
  chatId: number;
  lastUpdate: number;
}

const STREAM_THROTTLE_MS = 1000;
const MAX_MESSAGE_LENGTH = 4000;

export class ResponseStreamer {
  private bot: MaxBot;
  private currentMessage: StreamedMessage | null = null;
  private pendingText = "";
  private lastStreamTime = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bot: MaxBot) {
    this.bot = bot;
  }

  async onPartial(text: string, chatId: number): Promise<void> {
    this.pendingText = text;

    const now = Date.now();
    if (now - this.lastStreamTime < STREAM_THROTTLE_MS) {
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(
          () => {
            this.flush(chatId).catch((error) => {
              logger.error("[Streamer] Flush error:", error);
            });
            this.flushTimer = null;
          },
          STREAM_THROTTLE_MS - (now - this.lastStreamTime),
        );
      }
      return;
    }

    await this.flush(chatId);
  }

  private async flush(chatId: number): Promise<void> {
    if (!this.pendingText) return;

    this.lastStreamTime = Date.now();
    const rendered = renderText(this.pendingText);

    try {
      if (this.currentMessage) {
        const chunks = chunkText(rendered, MAX_MESSAGE_LENGTH);
        const mainChunk = chunks[0] ?? "";

        await this.bot.editMessage(this.currentMessage.messageId, {
          text: mainChunk,
          format: "markdown",
        });
        this.currentMessage.lastUpdate = Date.now();
      } else {
        const msg = await this.bot.sendMessage(chatId, {
          text: rendered.slice(0, MAX_MESSAGE_LENGTH),
          format: "markdown",
        });

        this.currentMessage = {
          messageId: msg.message_id,
          chatId,
          lastUpdate: Date.now(),
        };
      }
    } catch (error) {
      logger.error("[Streamer] Error updating message:", error);
    }
  }

  async onComplete(chatId: number): Promise<string | null> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingText) {
      await this.flush(chatId);
    }

    const messageId = this.currentMessage?.messageId ?? null;
    this.currentMessage = null;
    this.pendingText = "";

    return messageId;
  }

  reset(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentMessage = null;
    this.pendingText = "";
    this.lastStreamTime = 0;
  }
}
