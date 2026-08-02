import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";

const TOOL_STREAM_THROTTLE_MS = 2000;

export class ToolCallStreamer {
  private bot: MaxBot;
  private currentMessageId: string | null = null;
  private lastUpdate = 0;

  constructor(bot: MaxBot) {
    this.bot = bot;
  }

  async onToolCall(
    chatId: number,
    toolName: string,
    state: string,
  ): Promise<void> {
    const now = Date.now();
    if (now - this.lastUpdate < TOOL_STREAM_THROTTLE_MS && this.currentMessageId) {
      return;
    }

    const text = `🔧 ${toolName} (${state})`;

    try {
      if (this.currentMessageId) {
        await this.bot.editMessage(this.currentMessageId, { text });
      } else {
        const msg = await this.bot.sendMessage(chatId, { text });
        this.currentMessageId = msg.message_id;
      }
      this.lastUpdate = now;
    } catch (error) {
      logger.error("[ToolStreamer] Error:", error);
    }
  }

  async flush(): Promise<void> {
    this.currentMessageId = null;
    this.lastUpdate = 0;
  }
}
