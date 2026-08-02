import type { MaxBot } from "../bot.js";
import { COMMAND_DEFINITIONS } from "./definitions.js";

export function registerHelpCommand(bot: MaxBot): void {
  bot.command("help", "Show available commands", async (userId) => {
    let text = "📋 **Available Commands**\n\n";

    for (const def of COMMAND_DEFINITIONS) {
      text += `/${def.command} — ${def.descriptionKey.replace("cmd.description.", "")}\n`;
    }

    await bot.sendMessage(userId, { text, format: "markdown" });
  });
}
