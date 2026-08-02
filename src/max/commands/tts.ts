import type { MaxBot } from "../bot.js";

export function registerTtsCommand(bot: MaxBot): void {
  bot.command("tts", "Toggle text-to-speech", async (userId, chatId) => {
    const { settingsManager } = await import("../../settings/manager.js");
    const enabled = !settingsManager.isTtsEnabled();
    settingsManager.setTtsEnabled(enabled);

    await bot.sendMessage(chatId, {
      text: `🔊 TTS ${enabled ? "enabled" : "disabled"}.`,
    });
  });
}
