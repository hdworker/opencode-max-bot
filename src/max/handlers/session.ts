import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { settingsManager } from "../../settings/manager.js";
import { sessionManager } from "../../session/manager.js";
import { projectManager } from "../../project/manager.js";
import { openCodeWorkspace } from "../../opencode/workspace.js";
import { interactionManager } from "../../interaction/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { buildSessionPanel } from "../utils/session-panel.js";
import { clearChatWorkflowState } from "../../interaction/reset.js";

export function registerSessionSelectCallback(bot: MaxBot): void {
  bot.callback(
    (data) => data.startsWith("select_session:") || data.startsWith("session_action:"),
    async (userId, chatId, data, callback) => {
      if (data.startsWith("session_action:")) {
        const action = data.slice("session_action:".length);
        await bot.answerCallback(callback.callback_id, "⏳ Выполняю…");

        if (action === "new") {
          clearChatWorkflowState(chatId);
          const directory = projectManager.getCurrentProjectDirectory(chatId);
          const session = await openCodeWorkspace.createSession(directory);
          sessionManager.setCurrentSession(chatId, session.id, session.directory || directory);
          await bot.sendMessage(chatId, {
            text: `✅ Новая сессия создана: ${session.id.slice(0, 8)}`,
            attachments: [buildSessionPanel()],
          });
          return;
        }

        if (action === "rename") {
          const sessionId = sessionManager.getCurrentSession(chatId);
          if (!sessionId) {
            await bot.sendMessage(chatId, {
              text: "Сначала выберите сессию.",
              attachments: [buildSessionPanel()],
            });
            return;
          }
          interactionManager.start(chatId, "rename", sessionId);
          await bot.sendMessage(chatId, { text: "✏️ Отправьте новое название сессии." });
          return;
        }

        if (action === "status") {
          const health = await opencodeClient.global.health();
          const sessionId = sessionManager.getCurrentSession(chatId);
          await bot.sendMessage(chatId, {
            text: `📊 OpenCode: ${health.data?.healthy ? "✅ подключён" : "❌ недоступен"}\n💬 Сессия: ${sessionId ?? "не выбрана"}`,
            attachments: [buildSessionPanel()],
          });
          return;
        }

        if (action === "detach") {
          clearChatWorkflowState(chatId);
          sessionManager.setCurrentSession(chatId, null);
          await bot.sendMessage(chatId, {
            text: "🔌 Сессия отключена. Выберите /sessions или создайте /new.",
          });
          return;
        }

        await bot.sendMessage(chatId, { text: "Неизвестное действие сессии." });
        return;
      }

      if (!data.startsWith("select_session:")) return;

      const sessionId = data.replace("select_session:", "");

      logger.debug(`[SessionSelect] User ${userId} selected session: ${sessionId}`);

      try {
        await bot.answerCallback(callback.callback_id, "⏳ Открываю сессию…");

        await projectManager.loadProjects();
        const directory = projectManager.getCurrentProjectDirectory(chatId);
        const session = await openCodeWorkspace.getSession(sessionId, directory);

        clearChatWorkflowState(chatId);
        sessionManager.setCurrentSession(chatId, sessionId, session.directory);

        await bot.sendMessage(chatId, {
          text: `✅ **Сессия выбрана**\n\nНазвание: ${session.title}\nID: ${sessionId}\nПапка: ${session.directory ?? "не указана"}\n\nТеперь отправленный текст будет направлен в эту сессию.`,
          format: "markdown",
          attachments: [buildSessionPanel()],
        });

        logger.info(`[SessionSelect] Session set to: ${sessionId}`);
      } catch (error) {
        logger.error("[SessionSelect] Error:", error);
        await bot.sendMessage(chatId, {
          text: "❌ Не удалось выбрать сессию. Обновите список командой /sessions.",
        });
      }
    },
  );
}
