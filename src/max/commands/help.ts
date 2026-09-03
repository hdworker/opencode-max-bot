import type { MaxBot } from "../bot.js";
import { COMMAND_DEFINITIONS } from "./definitions.js";
import { t } from "../../i18n/index.js";

export function registerHelpCommand(bot: MaxBot): void {
  bot.command("help", "Show available commands", async (userId, chatId) => {
    let text = "📋 **Available Commands**\n\n";

    for (const def of COMMAND_DEFINITIONS) {
      text += `/${def.command} — ${t(def.descriptionKey)}\n`;
    }

    await bot.sendMessage(chatId, { text, format: "markdown" });
  });
}
