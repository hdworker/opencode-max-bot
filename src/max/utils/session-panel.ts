import type { InlineKeyboardAttachment } from "../client.js";

/** The persistent controls for the currently selected OpenCode session. */
export function buildSessionPanel(): InlineKeyboardAttachment {
  return {
    type: "inline_keyboard",
    payload: {
      buttons: [
        [
          { type: "callback", text: "💃 Модель", payload: "select_model" },
          { type: "callback", text: "🤖 Агент", payload: "select_agent" },
          { type: "callback", text: "⚙️ Вариант", payload: "select_variant" },
        ],
        [
          { type: "callback", text: "🆕 Новая сессия", payload: "session_action:new" },
          { type: "callback", text: "✏️ Переименовать", payload: "session_action:rename" },
        ],
        [
          { type: "callback", text: "📊 Статус", payload: "session_action:status" },
          { type: "callback", text: "🔌 Отключить", payload: "session_action:detach" },
        ],
      ],
    },
  };
}
