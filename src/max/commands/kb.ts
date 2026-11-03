import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { ingestArticleFromMax } from "../../kb/article-processor.js";
import type { ArticleFileAttachment } from "../../kb/article-input.js";
import type { MaxMessage } from "../client.js";

export function registerKnowledgeBaseCommand(bot: MaxBot): void {
  bot.command("kb", "Add an article to the knowledge base", async (_userId, chatId, _text, args, message) => {
    if (!config.knowledgeBase.ingestToken) {
      await bot.sendMessage(chatId, {
        text: "❌ Приём статей не настроен: задайте KB_INGEST_TOKEN для бота.",
      });
      return;
    }

    const attachment = getArticleAttachment(message);
    if (!args.trim() && !attachment) {
      await bot.sendMessage(chatId, {
        text: "Формат: /kb <ссылка или текст статьи>. Если сайт блокирует загрузку, приложите сохранённый файл .txt, .md или .html к команде /kb <ссылка на оригинал>.",
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
      const result = await ingestArticleFromMax(args, chatId, message.message_id, attachment);
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

function getArticleAttachment(message: MaxMessage): ArticleFileAttachment | undefined {
  for (const item of message.body.attachments ?? []) {
    if (!item || typeof item !== "object") continue;
    const attachment = item as { type?: unknown; payload?: unknown };
    if (attachment.type !== "file" || !attachment.payload || typeof attachment.payload !== "object") continue;
    const payload = attachment.payload as { url?: unknown; filename?: unknown };
    if (typeof payload.url !== "string" || typeof payload.filename !== "string") continue;
    return { url: payload.url, filename: payload.filename };
  }
  return undefined;
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
