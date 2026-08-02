import type { MaxBot } from "../bot.js";

export function registerTasklistCommand(bot: MaxBot): void {
  bot.command("tasklist", "Show task list", async (userId, chatId) => {
    await bot.sendMessage(chatId, {
      text: "📋 Task list coming soon.",
    });
  });
}
