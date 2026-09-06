import type { InlineKeyboardAttachment, KeyboardButton } from "../client.js";

export function buildInlineKeyboard(buttons: KeyboardButton[][]): InlineKeyboardAttachment {
  return {
    type: "inline_keyboard",
    payload: { buttons },
  };
}

export function buildSingleRowKeyboard(
  items: Array<{ text: string; payload: string }>,
): InlineKeyboardAttachment {
  return {
    type: "inline_keyboard",
    payload: {
      buttons: items.map((item) => [
        { type: "callback" as const, text: item.text, payload: item.payload },
      ]),
    },
  };
}

export function buildConfirmationKeyboard(
  confirmPayload: string,
  denyPayload: string,
): InlineKeyboardAttachment {
  return {
    type: "inline_keyboard",
    payload: {
      buttons: [
        [
          { type: "callback", text: "✅ Allow", payload: confirmPayload },
          { type: "callback", text: "🛑 Deny", payload: denyPayload },
        ],
      ],
    },
  };
}

export function buildQuestionOptionsKeyboard(
  options: Array<{ label: string; value: string }>,
  multiple: boolean,
  requestId: string,
  questionIndex: number,
  custom = true,
): InlineKeyboardAttachment {
  const buttons: KeyboardButton[][] = [];

  for (const option of options) {
    buttons.push([
      {
        type: "callback",
        text: option.label,
        payload: `q_option:${encodeURIComponent(requestId)}:${questionIndex}:${encodeURIComponent(option.value)}`,
      },
    ]);
  }

  if (multiple) {
    buttons.push([{ type: "callback", text: "➡️ Next", payload: `q_next:${encodeURIComponent(requestId)}:${questionIndex}` }]);
  }

  if (custom) {
    buttons.push([{ type: "callback", text: "✏️ Custom", payload: `q_custom:${encodeURIComponent(requestId)}:${questionIndex}` }]);
  }

  return {
    type: "inline_keyboard",
    payload: { buttons },
  };
}
