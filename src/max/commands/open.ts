import type { MaxBot } from "../bot.js";
import { projectManager } from "../../project/manager.js";
import { clearChatWorkflowState } from "../../interaction/reset.js";
import { getBrowserRoots, listDirectory, getFileInfo, getParent, type BrowserView } from "../../filesystem/browser.js";
import { clearFileCallbacks, rememberFileCallback, resolveFileCallback } from "../../filesystem/callback-store.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";
import { sessionManager } from "../../session/manager.js";

const PREFIX = "open:";
const PAGE_SIZE = 10;

function keyboard(chatId: number, view: BrowserView) {
  const buttons = view.entries
    .slice(0, PAGE_SIZE)
    .map((entry) => [{ type: "callback" as const, text: `${entry.type === "directory" ? "📁" : "📄"} ${entry.name}`, payload: `${PREFIX}${entry.type === "directory" ? "dir:" : "file:"}${rememberFileCallback(chatId, entry.path)}` }]);
  if (view.canGoUp) buttons.push([{ type: "callback" as const, text: "⬆️ Вверх", payload: `${PREFIX}up:${rememberFileCallback(chatId, getParent(view.currentPath))}` }]);
  buttons.push([{ type: "callback" as const, text: "✅ Выбрать эту папку", payload: `${PREFIX}select:${rememberFileCallback(chatId, view.currentPath)}` }]);
  return { type: "inline_keyboard" as const, payload: { buttons } };
}

async function sendView(bot: MaxBot, chatId: number, view: BrowserView): Promise<void> {
  await bot.sendMessage(chatId, { text: `📂 ${view.displayPath}\n\nПапок и файлов: ${view.entries.length}`, attachments: [keyboard(chatId, view)] });
}

export function registerOpenCommand(bot: MaxBot): void {
  bot.command("open", "Browse and select a project directory", async (_userId, chatId) => {
    clearFileCallbacks(chatId);
    try {
      const roots = getBrowserRoots();
      if (roots.length > 1) {
        const buttons = roots.map((root) => [{ type: "callback" as const, text: `📂 ${root}`, payload: `${PREFIX}dir:${rememberFileCallback(chatId, root)}` }]);
        await bot.sendMessage(chatId, { text: "📂 Выберите корень для просмотра:", attachments: [{ type: "inline_keyboard", payload: { buttons } }] });
        return;
      }
      await sendView(bot, chatId, await listDirectory(roots[0]!));
    } catch (error) {
      await bot.sendMessage(chatId, { text: `❌ Не удалось открыть файловую систему: ${error instanceof Error ? error.message : "неизвестная ошибка"}` });
    }
  });
}

export function registerOpenCallback(bot: MaxBot): void {
  bot.callback(PREFIX, async (_userId, chatId, data, callback) => {
    await bot.answerCallback(callback.callback_id);
    const match = data.match(/^open:(dir|up|select|file):(.+)$/);
    if (!match) return;
    const target = resolveTarget(chatId, match[2]!);
    if (!target) { await bot.sendMessage(chatId, { text: "⚠️ Кнопка устарела. Повторите /open." }); return; }
    try {
      if (match[1] === "select") {
        await selectDirectory(bot, chatId, target);
      } else if (match[1] === "file") {
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

function resolveTarget(chatId: number, token: string): string | null {
  return resolveFileCallback(chatId, token);
}

async function selectDirectory(bot: MaxBot, chatId: number, directory: string): Promise<void> {
  const project = projectManager.setCurrentProjectDirectory(chatId, directory);
  clearChatWorkflowState(chatId);
  const sessions = await openCodeWorkspace.listSessions(directory);
  sessionManager.setCurrentSession(chatId, null);
  const buttons = sessions.slice(0, 10).map((session) => [{
    type: "callback" as const,
    text: `💬 ${session.title}`,
    payload: `select_session:${session.id}`,
  }]);
  await bot.sendMessage(chatId, {
    text: `✅ Проект выбран\n\n${project.worktree}\n\n💬 Сессий проекта: ${sessions.length}\n${sessions.length > 0 ? "Выберите сессию или создайте новую командой /new." : "Создайте сессию командой /new."}`,
    format: "markdown",
    ...(buttons.length > 0 ? { attachments: [{ type: "inline_keyboard" as const, payload: { buttons } }] } : {}),
  });
  clearFileCallbacks(chatId);
}
