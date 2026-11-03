import { config } from "../config.js";
import { openCodeWorkspace } from "../opencode/workspace.js";
import { withTimeout } from "../utils/with-timeout.js";
import { logger } from "../utils/logger.js";
import { prepareArticle, type ArticleFileAttachment } from "./article-input.js";

const INGEST_TIMEOUT_MS = 30_000;

export interface IngestedArticle {
  title: string;
  source: string;
  chunks: number;
  summarized: boolean;
  updated: boolean;
}

export async function ingestArticleFromMax(
  input: string,
  chatId: number,
  messageId: string,
  attachment?: ArticleFileAttachment,
): Promise<IngestedArticle> {
  if (!config.knowledgeBase.ingestToken) {
    throw new Error("Приём статей не настроен: задайте KB_INGEST_TOKEN для бота.");
  }

  const article = await prepareArticle(input, attachment);
  let summary = "";
  if (config.knowledgeBase.summarizeWithOpenCode) {
    try {
      summary = await openCodeWorkspace.summarizeForKnowledgeBase(
        article.title,
        article.sourceUrl,
        article.content,
      );
    } catch (error) {
      logger.warn("[KB] OpenCode summarization failed; storing the source article without a summary:", error);
    }
  }

  const endpoint = new URL(config.knowledgeBase.ingestUrl);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("KB_INGEST_URL должен использовать HTTP или HTTPS.");
  }

  const controller = new AbortController();
  let response: Response;
  try {
    response = await withTimeout(
      fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.knowledgeBase.ingestToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: article.title,
          source_url: article.sourceUrl,
          content: article.content,
          summary,
          chat_id: chatId,
          message_id: messageId,
        }),
        signal: controller.signal,
      }),
      INGEST_TIMEOUT_MS,
      () => controller.abort(),
    );
  } catch (error) {
    throw new Error(`Сервис базы знаний недоступен: ${error instanceof Error ? error.message : String(error)}`);
  }

  const responseText = await response.text();
  let result: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (parsed && typeof parsed === "object") result = parsed as Record<string, unknown>;
  } catch {
    // Keep the status-specific message below when the server returns non-JSON.
  }

  if (!response.ok) {
    const detail = typeof result.error === "string" ? result.error : `HTTP ${response.status}`;
    throw new Error(`Сервис базы знаний отклонил статью: ${detail}`);
  }

  const source = typeof result.source === "string" ? result.source : "";
  const title = typeof result.title === "string" ? result.title : article.title;
  const chunks = typeof result.chunks === "number" ? result.chunks : 0;
  return {
    title,
    source,
    chunks,
    summarized: summary.length > 0,
    updated: result.status === "updated",
  };
}
