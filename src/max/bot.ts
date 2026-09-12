import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type {
  MaxUpdate,
  MaxMessage,
  MaxCallback,
  InlineKeyboardAttachment,
  KeyboardButton,
  Attachment,
  SendMessageBody,
} from "./client.js";
import { maxClient } from "./client.js";
import { MaxTransport, normalizeMaxUpdate } from "./transport.js";
import { MaxUpdateDispatcher } from "./update-dispatcher.js";
import { interactionManager } from "../interaction/manager.js";
import { clearChatWorkflowState } from "../interaction/reset.js";

export type UpdateHandler = (update: MaxUpdate) => void | Promise<void>;

export type CommandHandler = (
  userId: number,
  chatId: number,
  text: string,
  args: string,
  message: MaxMessage,
) => void | Promise<void>;

export type CallbackHandler = (
  userId: number,
  chatId: number,
  data: string,
  callback: MaxCallback,
) => void | Promise<void>;

export type CallbackMatcher = string | ((payload: string) => boolean);

export type MessageHandler = (
  userId: number,
  chatId: number,
  text: string,
  message: MaxMessage,
) => void | Promise<void>;

interface CommandRegistration {
  name: string;
  description: string;
}

class MaxBot {
  private marker: string | undefined = undefined;
  private isRunning = false;
  private pollAbortController: AbortController | null = null;
  private commands: CommandRegistration[] = [];
  private commandHandlers = new Map<string, CommandHandler>();
  private messageHandlers: MessageHandler[] = [];
  private callbackHandlers: CallbackHandler[] = [];
  private callbackRoutes: Array<{ matcher: CallbackMatcher; handler: CallbackHandler }> = [];
  private updateHandlers: UpdateHandler[] = [];
  private authUserId: number;
  private transport = new MaxTransport();
  private updateDispatcher = new MaxUpdateDispatcher(
    (error, update) => {
      logger.error(`[Bot] Error processing update ${update.update_type}:`, error);
    },
    (_update, inbound) => {
      if (inbound.kind !== "message") return false;
      const chatId = inbound.address.chatId;
      const hadInteraction = interactionManager.getActive(chatId) !== null;
      if (!interactionManager.isActive(chatId)) {
        if (hadInteraction) clearChatWorkflowState(chatId);
        return false;
      }
      const kind = interactionManager.getActive(chatId)?.kind;
      return kind === "rename" || kind === "question" || kind === "question_custom";
    },
  );

  constructor() {
    this.authUserId = config.max.allowedUserId;
  }

  command(name: string, description: string, handler: CommandHandler): this {
    this.commands.push({ name, description });
    this.commandHandlers.set(name, handler);
    return this;
  }

  onMessage(handler: MessageHandler): this {
    this.messageHandlers.push(handler);
    return this;
  }

  onCallback(handler: CallbackHandler): this {
    this.callbackHandlers.push(handler);
    return this;
  }

  callback(matcher: CallbackMatcher, handler: CallbackHandler): this {
    this.callbackRoutes.push({ matcher, handler });
    return this;
  }

  onUpdate(handler: UpdateHandler): this {
    this.updateHandlers.push(handler);
    return this;
  }

  private isAuthorized(userId: number): boolean {
    return this.authUserId === 0 || userId === this.authUserId;
  }

  private async processUpdate(update: MaxUpdate): Promise<void> {
    try {
      for (const handler of this.updateHandlers) {
        await handler(update);
      }

      const inbound = normalizeMaxUpdate(update);
      if (!inbound) return;

      if (!this.isAuthorized(inbound.address.userId)) {
        logger.warn(
          `[Bot] Ignoring ${inbound.kind} from unauthorized user ${inbound.address.userId}`,
        );
        return;
      }

      switch (inbound.kind) {
        case "message": {
          const { userId, chatId } = inbound.address;
          const { text, message } = inbound;

          logger.debug(`[Bot] Message text: "${text}" (length: ${text.length})`);

          if (text.startsWith("/")) {
            const spaceIndex = text.indexOf(" ");
            const commandName = spaceIndex > 0 ? text.slice(1, spaceIndex) : text.slice(1);
            const args = spaceIndex > 0 ? text.slice(spaceIndex + 1) : "";

            logger.debug(`[Bot] Command parsed: name="${commandName}", args="${args}"`);
            logger.debug(
              `[Bot] Registered commands: ${Array.from(this.commandHandlers.keys()).join(", ")}`,
            );

            const handler = this.commandHandlers.get(commandName);
            if (handler) {
              logger.debug(`[Bot] Found handler for /${commandName}`);
              await handler(userId, chatId, text, args, message);
              return;
            }

            logger.debug(`[Bot] Unknown command: /${commandName}`);
            return;
          }

          for (const handler of this.messageHandlers) {
            await handler(userId, chatId, text, message);
          }
          break;
        }

        case "callback": {
          const { userId, chatId } = inbound.address;
          const { callback, payload } = inbound;
          logger.info(`[Bot] Callback event: user=${userId}, chat=${chatId}, payload="${payload}"`);

          const route = this.callbackRoutes.find(({ matcher }) =>
            typeof matcher === "string" ? payload.startsWith(matcher) : matcher(payload),
          );
          if (route) {
            await route.handler(userId, chatId, payload, callback);
            return;
          }

          for (const handler of this.callbackHandlers) {
            await handler(userId, chatId, payload, callback);
          }
          break;
        }

        case "bot_started": {
          const { userId, chatId } = inbound.address;

          const startHandler = this.commandHandlers.get("start");
          if (startHandler) {
            await startHandler(userId, chatId, "/start", "", {
              message_id: "",
              recipient: { chat_id: userId, chat_type: "dialog" },
              body: { mid: "", seq: 0, text: "/start" },
              stat: {},
            });
          }
          break;
        }
      }
    } catch (error) {
      logger.error(`[Bot] Error processing update ${update.update_type}:`, error);
    }
  }

  async sendMessage(userId: number, body: SendMessageBody): Promise<MaxMessage> {
    return this.transport.reply({ chatId: userId, userId }, body);
  }

  async editMessage(messageId: string, body: Partial<SendMessageBody>): Promise<MaxMessage> {
    return maxClient.editMessage(messageId, body);
  }

  async deleteMessage(messageId: string): Promise<void> {
    return maxClient.deleteMessage(messageId);
  }

  async answerCallback(
    callbackId: string,
    notification?: string,
    message?: { text?: string; format?: "markdown" | "html"; attachments?: Attachment[] },
  ): Promise<void> {
    try {
      await this.transport.acknowledge(callbackId, notification, message);
    } catch (error) {
      logger.warn(`[Bot] Failed to acknowledge callback ${callbackId}:`, error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("[Bot] Already running");
      return;
    }

    try {
      const me = await maxClient.getMe();
      logger.info(`[Bot] Connected as @${me.username} (${me.name})`);
    } catch (error) {
      logger.error("[Bot] Failed to get bot info:", error);
      throw error;
    }

    this.isRunning = true;
    this.pollAbortController = new AbortController();

    logger.info("[Bot] Starting long polling...");

    while (this.isRunning) {
      try {
        logger.debug(`[Bot] Polling with marker=${this.marker ?? "none"}`);
        const response = await maxClient.getUpdates(this.marker, 30);

        logger.debug(
          `[Bot] Got ${response.updates?.length ?? 0} updates, marker=${response.marker ?? "none"}`,
        );

        if (response.marker) {
          this.marker = response.marker;
        }

        for (const update of response.updates ?? []) {
          logger.debug(`[Bot] Processing update: ${update.update_type}`);
          this.updateDispatcher.dispatch(update, (queuedUpdate) =>
            this.processUpdate(queuedUpdate),
          );
        }
      } catch (error) {
        if (!this.isRunning) break;

        if (error instanceof Error && error.name === "AbortError") {
          break;
        }

        logger.error("[Bot] Polling error:", error);
        await sleep(5000);
      }
    }

    logger.info("[Bot] Stopped");
  }

  stop(): void {
    this.isRunning = false;
    this.pollAbortController?.abort();
    this.pollAbortController = null;
    logger.info("[Bot] Stopping...");
  }

  getCommands(): CommandRegistration[] {
    return this.commands;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBot(): MaxBot {
  return new MaxBot();
}

export { MaxBot };
