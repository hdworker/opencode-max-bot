import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { ingestArticleFromMax, listArticlesFromMax } from "../../kb/article-processor.js";
import type { ArticleFileAttachment } from "../../kb/article-input.js";
import type { MaxMessage } from "../client.js";

export function registerKnowledgeBaseCommand(bot: MaxBot): void {
  bot.command("kb", "Add an article or list chat materials", async (_userId, chatId, _text, args, message) => {
    if (!config.knowledgeBase.ingestToken) {
      await bot.sendMessage(chatId, {
        text: "❌ Приём статей не настроен: задайте KB_INGEST_TOKEN для бота.",
      });
      return;
    }

    if (["list", "список"].includes(args.trim().toLowerCase())) {
      try {
        const result = await listArticlesFromMax(chatId);
        if (result.total === 0) {
          await bot.sendMessage(chatId, { text: "📚 В этом чате пока нет добавленных материалов." });
          return;
        }
        const lines = result.articles.map((article, index) => {
          const date = article.added_at ? new Date(article.added_at).toLocaleDateString("ru-RU") : "";
          const title = article.title.length > 100 ? `${article.title.slice(0, 97)}…` : article.title;
          const source = article.source_url.length > 150
            ? `${article.source_url.slice(0, 147)}…`
            : article.source_url;
          return `${index + 1}. ${title}${date ? ` · ${date}` : ""}${source ? `\n   ${source}` : ""}`;
        });
        const more = result.total > result.articles.length
          ? `\n\nПоказаны последние ${result.articles.length} из ${result.total}.`
          : "";
        await bot.sendMessage(chatId, {
          text: `📚 Материалы этого чата (${result.total}):\n\n${lines.join("\n\n")}${more}`,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Неизвестная ошибка";
        await bot.sendMessage(chatId, { text: `❌ Не удалось получить список материалов.\n${detail}` });
      }
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
