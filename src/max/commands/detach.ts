import type { MaxBot } from "../bot.js";
import { sessionManager } from "../../session/manager.js";

export function registerDetachCommand(bot: MaxBot): void {
  bot.command("detach", "Detach from current session", async (userId, chatId) => {
    sessionManager.setCurrentSession(chatId, null);
    await bot.sendMessage(chatId, {
      text: "🔌 Detached from session. Use /new to start a new one.",
    });
  });
}
