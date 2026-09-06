import type { MaxBot } from "../bot.js";
import { sessionManager } from "../../session/manager.js";
import { clearChatWorkflowState } from "../../interaction/reset.js";

export function registerDetachCommand(bot: MaxBot): void {
  bot.command("detach", "Detach from current session", async (userId, chatId) => {
    clearChatWorkflowState(chatId);
    sessionManager.setCurrentSession(chatId, null);
    await bot.sendMessage(chatId, {
      text: "🔌 Detached from session. Use /new to start a new one.",
    });
  });
}
