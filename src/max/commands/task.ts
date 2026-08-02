import type { MaxBot } from "../bot.js";

export function registerTaskCommand(bot: MaxBot): void {
  bot.command("task", "Show task information", async (userId, chatId) => {
    await bot.sendMessage(chatId, {
      text: "📋 Task management coming soon.",
    });
  });
}
