import type { MaxBot, CallbackHandler } from "../bot.js";
import { questionManager } from "../../question/manager.js";
import { opencodeClient } from "../../opencode/client.js";
import { logger } from "../../utils/logger.js";

export function registerQuestionCallback(bot: MaxBot): void {
  bot.onCallback(async (userId, chatId, data, callback) => {
    if (!questionManager.isActive()) return;

    const current = questionManager.getCurrentQuestion();
    if (!current) return;

    if (data.startsWith("q_option_")) {
      const optionValue = data.replace("q_option_", "");
      questionManager.selectOption(0, optionValue);

      if (!current.multiple) {
        const selected = questionManager.getSelectedOptions().get(0) ?? [];
        if (selected.length > 0) {
          try {
            const result = await opencodeClient.question.reply({
              body: {
                requestID: current.questionId,
                answers: selected.map((v) => [v]),
              },
            } as any);

            if (result.error) throw result.error;
          } catch (error) {
            logger.error("[Question] Reply error:", error);
          }
          questionManager.clear();
        }
      }

      await bot.answerCallback(callback.callback_id, `Selected: ${optionValue}`);
    }

    if (data === "q_custom") {
      await bot.sendMessage(chatId, { text: "✏️ Type your answer:" });
      await bot.answerCallback(callback.callback_id);
    }

    if (data === "q_next") {
      questionManager.nextQuestion();
      const next = questionManager.getCurrentQuestion();
      if (next) {
        let text = `❓ ${next.question}\n\n`;
        for (const option of next.options) {
          text += `• ${option.label}\n`;
        }
        await bot.sendMessage(chatId, { text });
      }
    }
  });
}
