import type { MaxBot } from "../bot.js";

export function registerCommandsCommand(bot: MaxBot): void {
  bot.command("commands", "List all bot commands", async (userId, chatId) => {
    const { COMMAND_DEFINITIONS } = await import("./definitions.js");

    let text = "📋 **All Commands**\n\n";
    for (const def of COMMAND_DEFINITIONS) {
      text += `/${def.command}\n`;
    }

    await bot.sendMessage(chatId, { text, format: "markdown" });
  });
}
