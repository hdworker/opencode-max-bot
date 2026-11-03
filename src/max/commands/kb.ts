import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { ingestArticleFromMax } from "../../kb/article-processor.js";

export function registerKnowledgeBaseCommand(bot: MaxBot): void {
  bot.command("kb", "Add an article to the knowledge base", async (_userId, chatId, _text, args, message) => {
    if (!config.knowledgeBase.ingestToken) {
      await bot.sendMessage(chatId, {
        text: "❌ Приём статей не настроен: задайте KB_INGEST_TOKEN для бота.",
      });
      return;
    }

    if (!args.trim()) {
      await bot.sendMessage(chatId, {
        text: "Формат: /kb <ссылка или текст статьи>. Для ссылки бот загрузит статью, попросит локальный OpenCode сделать конспект и добавит материал в базу знаний.",
      });
      return;
    }

    let statusMessage: Awaited<ReturnType<MaxBot["sendMessage"]>> | undefined;
    try {
      statusMessage = await bot.sendMessage(chatId, { text: "⏳ Обрабатываю статью…" });
    } catch (error) {
      logger.warn("[KB] Could not send processing status:", error);
    }

    try {
      const result = await ingestArticleFromMax(args, chatId, message.message_id);
      const status = result.updated ? "обновлена" : "добавлена";
      const summary = result.summarized ? "Конспект OpenCode сохранён." : "Сохранён исходный текст без конспекта.";
      const text = `✅ Статья ${status}: ${result.title}\n${summary}\nИсточник: ${result.source} · фрагментов для поиска: ${result.chunks}`;
      await replyWithStatus(bot, chatId, statusMessage?.message_id, { text });
    } catch (error) {
      logger.error("[KB] Article ingestion failed:", error);
      const detail = error instanceof Error ? error.message : "Неизвестная ошибка";
      await replyWithStatus(bot, chatId, statusMessage?.message_id, { text: `❌ Не удалось добавить статью.\n${detail}` });
    }
  });
}

async function replyWithStatus(
  bot: MaxBot,
  chatId: number,
  messageId: string | undefined,
  body: Parameters<MaxBot["sendMessage"]>[1],
): Promise<void> {
  if (messageId) {
    try {
      await bot.editMessage(messageId, body);
      return;
    } catch (error) {
      logger.warn("[KB] Could not update processing status:", error);
    }
  }
  await bot.sendMessage(chatId, body);
}
