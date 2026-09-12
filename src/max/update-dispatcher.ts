import type { MaxUpdate } from "./client.js";
import { normalizeMaxUpdate, type InboundMaxUpdate } from "./transport.js";

export type UpdateTask = (update: MaxUpdate) => void | Promise<void>;
export type UpdateErrorHandler = (error: unknown, update: MaxUpdate) => void;
export type PriorityUpdatePredicate = (update: MaxUpdate, inbound: InboundMaxUpdate) => boolean;

/**
 * Keeps long-running message work from blocking callbacks and commands.
 *
 * Regular messages remain ordered per chat, while control updates are
 * dispatched immediately. This is important for OpenCode prompts: a prompt
 * can wait for a permission/question callback that must be processed by the
 * same MAX polling loop.
 */
export class MaxUpdateDispatcher {
  private readonly messageTails = new Map<number, Promise<void>>();

  constructor(
    private readonly onError: UpdateErrorHandler = () => undefined,
    private readonly isPriorityUpdate: PriorityUpdatePredicate = () => false,
  ) {}

  dispatch(update: MaxUpdate, task: UpdateTask): void {
    const inbound = normalizeMaxUpdate(update);
    const isRegularMessage =
      inbound?.kind === "message" &&
      !inbound.text.startsWith("/") &&
      !this.isPriorityUpdate(update, inbound);

    if (!isRegularMessage) {
      void this.run(update, task);
      return;
    }

    const chatId = inbound.address.chatId;
    const previous = this.messageTails.get(chatId) ?? Promise.resolve();
    const current = previous.then(
      () => this.run(update, task),
      () => this.run(update, task),
    );

    this.messageTails.set(chatId, current);
    void current.then(() => {
      if (this.messageTails.get(chatId) === current) {
        this.messageTails.delete(chatId);
      }
    });
  }

  private async run(update: MaxUpdate, task: UpdateTask): Promise<void> {
    try {
      await task(update);
    } catch (error) {
      this.onError(error, update);
    }
  }
}
