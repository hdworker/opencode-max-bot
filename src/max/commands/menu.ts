import type { MaxBot } from "../bot.js";
import { buildSessionPanel } from "../utils/session-panel.js";

export function registerMenuCommand(bot: MaxBot): void {
  bot.command("menu", "Show session controls", async (_userId, chatId) => {
    await bot.sendMessage(chatId, {
      text: "🎛️ Панель управления текущей сессией:",
      attachments: [buildSessionPanel()],
    });
  });
}
