import type { MaxBot } from "../bot.js";
import { projectManager } from "../../project/manager.js";
import { getFileInfo, getParent, listDirectory, type BrowserView } from "../../filesystem/browser.js";
import { clearFileCallbacks, rememberFileCallback, resolveFileCallback } from "../../filesystem/callback-store.js";

const PREFIX = "ls:";
const PAGE_SIZE = 10;

function keyboard(chatId: number, view: BrowserView) {
  const buttons = view.entries.slice(0, PAGE_SIZE).map((entry) => [{
    type: "callback" as const,
    text: `${entry.type === "directory" ? "📁" : "📄"} ${entry.name}`,
    payload: `${PREFIX}${entry.type === "directory" ? "dir:" : "file:"}${rememberFileCallback(chatId, entry.path)}`,
  }]);
  if (view.canGoUp) buttons.push([{ type: "callback" as const, text: "⬆️ Вверх", payload: `${PREFIX}up:${rememberFileCallback(chatId, getParent(view.currentPath))}` }]);
  return { type: "inline_keyboard" as const, payload: { buttons } };
}

async function sendView(bot: MaxBot, chatId: number, view: BrowserView): Promise<void> {
  await bot.sendMessage(chatId, { text: `📁 ${view.displayPath}\n\nЭлементов: ${view.entries.length}`, attachments: [keyboard(chatId, view)] });
}

export function registerLsCommand(bot: MaxBot): void {
  bot.command("ls", "List files in the current project", async (_userId, chatId) => {
    const directory = projectManager.getCurrentProjectDirectory(chatId);
    if (!directory) {
      await bot.sendMessage(chatId, { text: "📂 Сначала выберите проект через /projects или /open." });
      return;
    }
    clearFileCallbacks(chatId);
    try {
      await sendView(bot, chatId, await listDirectory(directory));
    } catch (error) {
      await bot.sendMessage(chatId, { text: `❌ ${error instanceof Error ? error.message : "Не удалось прочитать папку."}` });
    }
  });
}

export function registerLsCallback(bot: MaxBot): void {
  bot.callback(PREFIX, async (_userId, chatId, data, callback) => {
    await bot.answerCallback(callback.callback_id);
    const match = data.match(/^ls:(dir|up|file):(.+)$/);
    if (!match) return;
    const target = resolveFileCallback(chatId, match[2]!);
    if (!target) { await bot.sendMessage(chatId, { text: "⚠️ Кнопка устарела. Повторите /ls." }); return; }
    try {
      if (match[1] === "file") {
        const file = await getFileInfo(target);
        await bot.sendMessage(chatId, { text: `📄 ${file.name}\nРазмер: ${file.size ?? 0} байт\nПуть: ${file.path}` });
      } else {
        clearFileCallbacks(chatId);
        await sendView(bot, chatId, await listDirectory(target));
      }
    } catch (error) {
      await bot.sendMessage(chatId, { text: `❌ ${error instanceof Error ? error.message : "Операция не выполнена."}` });
    }
  });
}
