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
  alwaysPayload?: string,
): InlineKeyboardAttachment {
  const buttons: KeyboardButton[] = [
    { type: "callback", text: "✅ Allow once", payload: confirmPayload },
  ];
  if (alwaysPayload) {
    buttons.push({ type: "callback", text: "♾️ Always allow", payload: alwaysPayload });
  }
  buttons.push({ type: "callback", text: "🛑 Deny", payload: denyPayload });

  return {
    type: "inline_keyboard",
    payload: {
      buttons: [buttons],
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
