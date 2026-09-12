import type { MaxBot } from "../bot.js";
import { buildSessionPanel } from "../utils/session-panel.js";

export function buildMenuButton() {
  return {
    type: "inline_keyboard" as const,
    payload: {
      buttons: [[{ type: "callback" as const, text: "☰ Меню", payload: "menu:open" }]],
    },
  };
}

export function registerMenuCommand(bot: MaxBot): void {
  bot.command("menu", "Show session controls", async (_userId, chatId) => {
    await bot.sendMessage(chatId, {
      text: "🎛️ Панель управления текущей сессией:",
      attachments: [buildSessionPanel()],
    });
  });

  bot.callback("menu:open", async (_userId, chatId, _data, callback) => {
    await bot.answerCallback(callback.callback_id, "✅");
    await bot.sendMessage(chatId, {
      text: "🎛️ Панель управления текущей сессией:",
      attachments: [buildSessionPanel()],
    });
  });
}
