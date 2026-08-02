import type { MaxBot } from "../bot.js";

export function registerDetachCommand(bot: MaxBot): void {
  bot.command("detach", "Detach from current session", async (userId, chatId) => {
    await bot.sendMessage(chatId, {
      text: "🔌 Detached from session. Use /new to start a new one.",
    });
  });
}
