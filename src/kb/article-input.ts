import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { chromium } from "playwright";

const MAX_ARTICLE_BYTES = 1_500_000;
const MAX_ARTICLE_CHARS = 200_000;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;

export interface PreparedArticle {
  title: string;
  sourceUrl?: string;
  content: string;
}

export interface ArticleFileAttachment {
  url: string;
  filename: string;
}

interface DownloadedResponse {
  statusCode: number;
  headers: import("node:http").IncomingHttpHeaders;
  body: Buffer;
}

function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  if (a === undefined || b === undefined || c === undefined) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isInfostartHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "infostart.ru" || normalized.endsWith(".infostart.ru");
}

async function resolvePublicIpv4(url: URL): Promise<string> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) === 6) {
    throw new Error("Ссылки с IPv6-адресом пока не поддерживаются.");
  }
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) {
    throw new Error("Ссылка должна использовать стандартный веб-порт.");
  }

  const resolved = await dnsLookup(hostname, { family: 4 });
  if (!isPublicIpv4(resolved.address)) {
    throw new Error("Ссылка ведёт на локальный или зарезервированный адрес.");
  }
  return resolved.address;
}

function downloadOnce(url: URL, address: string): Promise<DownloadedResponse> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const requestOptions: import("node:http").RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname || "/"}${url.search}`,
      method: "GET",
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,text/markdown,application/json,application/xml;q=0.9,*/*;q=0.1",
        "Accept-Encoding": "identity",
        "User-Agent": "OpenCode-MAX-KB/1.0",
      },
    };

    const outgoing = request(requestOptions, (response) => {
      const declaredLength = Number(response.headers["content-length"] ?? 0);
      if (declaredLength > MAX_ARTICLE_BYTES) {
        outgoing.destroy(new Error("Статья больше 1,5 МБ."));
        return;
      }

      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += data.length;
        if (length > MAX_ARTICLE_BYTES) {
          outgoing.destroy(new Error("Статья больше 1,5 МБ."));
          return;
        }
        chunks.push(data);
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
      response.on("error", reject);
    });

    outgoing.setTimeout(REQUEST_TIMEOUT_MS, () => {
      outgoing.destroy(new Error("Сайт не ответил за 15 секунд."));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function downloadArticle(startUrl: URL): Promise<{ title: string; content: string; sourceUrl: string }> {
  if (isInfostartHost(startUrl.hostname)) return downloadArticleWithPlaywright(startUrl);

  let url = startUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Поддерживаются только ссылки HTTP и HTTPS.");
    }
    if (url.username || url.password) throw new Error("Ссылки с логином и паролем не поддерживаются.");

    const address = await resolvePublicIpv4(url);
    const response = await downloadOnce(url, address);
    const location = response.headers.location;

    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      if (redirects === MAX_REDIRECTS) throw new Error("Слишком много перенаправлений.");
      url = new URL(location, url);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode === 429) {
        throw new Error(
          "Сайт ограничил автоматическую загрузку (HTTP 429). Попробуйте позже или отправьте сохранённую копию статьи файлом .txt, .md или .html вместе с командой /kb и исходной ссылкой.",
        );
      }
      throw new Error(`Сайт вернул HTTP ${response.statusCode}.`);
    }

    const contentTypeHeader = response.headers["content-type"];
    const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader) ?? "";
    if (!/^(text\/(html|plain|markdown)|application\/(xhtml\+xml|json|xml))(?:\s*;|$)/i.test(contentType)) {
      throw new Error("По ссылке нужен текст или HTML; PDF и другие файлы пока не поддерживаются.");
    }

    const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
    let rawText: string;
    try {
      rawText = new TextDecoder(charset).decode(response.body);
    } catch {
      rawText = response.body.toString("utf8");
    }

    const isHtml = /html|xhtml/i.test(contentType);
    const title = isHtml ? extractHtmlTitle(rawText) : "";
    const content = isHtml ? htmlToText(rawText) : rawText.trim();
    if (!content) throw new Error("В ответе сайта не найден текст статьи.");
    if (content.length > MAX_ARTICLE_CHARS) {
      throw new Error(`Текст статьи превышает лимит ${MAX_ARTICLE_CHARS.toLocaleString("ru-RU")} символов.`);
    }

    return { title: title || titleFromText(content), content, sourceUrl: url.toString() };
  }

  throw new Error("Не удалось загрузить статью.");
}

async function downloadArticleWithPlaywright(
  startUrl: URL,
): Promise<{ title: string; content: string; sourceUrl: string }> {
  if (startUrl.protocol !== "https:" || !isInfostartHost(startUrl.hostname)) {
    throw new Error("Загрузка через Chromium включена только для HTTPS-статей Infostart.");
  }
  await resolvePublicIpv4(startUrl);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось запустить Chromium для загрузки Infostart: ${detail}`);
  }

  try {
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(REQUEST_TIMEOUT_MS);
    const checkedHosts = new Map<string, Promise<string>>();

    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.protocol !== "https:" || !isInfostartHost(requestUrl.hostname)) {
        await route.abort();
        return;
      }

      if (["image", "media", "font"].includes(route.request().resourceType())) {
        await route.abort();
        return;
      }

      try {
        const key = requestUrl.host;
        let resolved = checkedHosts.get(key);
        if (!resolved) {
          resolved = resolvePublicIpv4(requestUrl);
          checkedHosts.set(key, resolved);
        }
        await resolved;
        await route.continue();
      } catch {
        await route.abort();
      }
    });

    const response = await page.goto(startUrl.toString(), { waitUntil: "domcontentloaded" });
    if (!response) throw new Error("Chromium не получил ответ страницы Infostart.");
    if (response.status() === 429) {
      throw new Error(
        "Infostart вернул HTTP 429 и при загрузке через Chromium с VPS. Доступ ограничен на стороне сайта; приложите файл статьи .txt, .md или .html.",
      );
    }
    if (!response.ok()) throw new Error(`Chromium получил от Infostart HTTP ${response.status()}.`);

    const title = await page.title();
    const articleHtml = await page
      .locator("article")
      .first()
      .evaluate((element) => element.outerHTML)
      .catch(() => "");
    const mainHtml =
      articleHtml ||
      (await page
        .locator("main")
        .first()
        .evaluate((element) => element.outerHTML)
        .catch(() => ""));
    const html = mainHtml || await page.content();
    if (Buffer.byteLength(html, "utf8") > MAX_ARTICLE_BYTES) {
      throw new Error("Статья больше 1,5 МБ.");
    }

    const content = htmlToText(html);
    if (!content) throw new Error("Chromium не нашёл текст статьи на странице Infostart.");
    if (content.length > MAX_ARTICLE_CHARS) {
      throw new Error(`Текст статьи превышает лимит ${MAX_ARTICLE_CHARS.toLocaleString("ru-RU")} символов.`);
    }
    if (
      content.length < 150 &&
      /captcha|access denied|checking your browser|проверка браузера/i.test(title)
    ) {
      throw new Error("Infostart показал проверочную страницу вместо текста статьи.");
    }

    return {
      title: title || extractHtmlTitle(html) || titleFromText(content),
      content,
      sourceUrl: page.url(),
    };
  } finally {
    await browser.close();
  }
}

async function downloadArticleFile(attachment: ArticleFileAttachment): Promise<PreparedArticle> {
  const filename = attachment.filename.replace(/[\\/]/g, "").trim();
  const extension = filename.toLowerCase().match(/\.(txt|md|markdown|html|htm)$/)?.[1];
  if (!extension) {
    throw new Error("Для загрузки приложите текстовый файл .txt, .md или .html.");
  }

  let url: URL;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new Error("Не удалось открыть приложенный файл из MAX.");
  }

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Ссылка на приложенный файл должна использовать HTTP или HTTPS.");
    }
    if (url.username || url.password) throw new Error("Ссылка на приложенный файл некорректна.");

    const address = await resolvePublicIpv4(url);
    const response = await downloadOnce(url, address);
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
      if (redirects === MAX_REDIRECTS) throw new Error("Слишком много перенаправлений при загрузке файла.");
      url = new URL(location, url);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Не удалось скачать приложенный файл: HTTP ${response.statusCode}.`);
    }

    const contentTypeHeader = response.headers["content-type"];
    const contentType = (Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader) ?? "";
    const isHtml = /\.(html|htm)$/.test(extension) || /^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType);
    const isTextMime = /^(text\/(plain|markdown|html)|application\/(xhtml\+xml|octet-stream))(?:\s*;|$)/i.test(contentType);
    if (!isTextMime) {
      throw new Error("Вложение должно быть текстовым файлом .txt, .md или .html; PDF пока не поддерживается.");
    }

    const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
    let rawText: string;
    try {
      rawText = new TextDecoder(charset).decode(response.body);
    } catch {
      rawText = response.body.toString("utf8");
    }

    const titleFromHtml = isHtml ? extractHtmlTitle(rawText) : "";
    const content = isHtml ? htmlToText(rawText) : rawText.trim();
    if (!content) throw new Error("В приложенном файле не найден текст статьи.");
    if (content.length > MAX_ARTICLE_CHARS) {
      throw new Error(`Текст статьи превышает лимит ${MAX_ARTICLE_CHARS.toLocaleString("ru-RU")} символов.`);
    }

    const filenameTitle = filename.replace(/\.(txt|md|markdown|html|htm)$/i, "").trim();
    return { title: titleFromHtml || filenameTitle || titleFromText(content), content };
  }

  throw new Error("Не удалось загрузить приложенный файл.");
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    mdash: "—",
    ndash: "–",
    hellip: "…",
  };

  return value
    .replace(/&#(x[\da-f]+|\d+);?/gi, (_match, code: string) => {
      const number = code.toLowerCase().startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      try {
        return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "�";
      } catch {
        return "�";
      }
    })
    .replace(/&(amp|apos|gt|lt|nbsp|quot|mdash|ndash|hellip);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<\/(p|div|section|article|main|h[1-6]|li|tr|blockquote)\s*>/gi, "\n\n")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? decodeHtmlEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
}

function titleFromText(text: string): string {
  return text.split(/\r?\n/).map((line) => line.replace(/^#{1,6}\s*/, "").trim()).find(Boolean)?.slice(0, 200) ?? "Материал из MAX";
}

export async function prepareArticle(input: string, attachment?: ArticleFileAttachment): Promise<PreparedArticle> {
  const raw = input.trim();
  if (!raw && !attachment) throw new Error("Добавьте ссылку, текст статьи или текстовый файл после команды /kb.");
  if (raw.length > MAX_ARTICLE_CHARS) {
    throw new Error(`Текст статьи превышает лимит ${MAX_ARTICLE_CHARS.toLocaleString("ru-RU")} символов.`);
  }

  const linkMatch = raw.match(/^(https?:\/\/\S+)(?:\s+([\s\S]+))?$/i);
  if (attachment) {
    const article = await downloadArticleFile(attachment);
    if (linkMatch) {
      try {
        const sourceUrl = new URL(linkMatch[1]);
        if ((sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") || sourceUrl.username || sourceUrl.password) {
          throw new Error();
        }
        article.sourceUrl = sourceUrl.toString();
      } catch {
        throw new Error("Не удалось разобрать ссылку на оригинал статьи.");
      }
      const notes = linkMatch[2]?.trim();
      if (notes) article.content = `${article.content}\n\nПримечание пользователя:\n${notes}`;
    } else if (raw) {
      article.content = `${article.content}\n\nПримечание пользователя:\n${raw}`;
    }
    if (article.content.length > MAX_ARTICLE_CHARS) {
      throw new Error(`Текст статьи превышает лимит ${MAX_ARTICLE_CHARS.toLocaleString("ru-RU")} символов.`);
    }
    return article;
  }

  if (linkMatch) {
    let startUrl: URL;
    try {
      startUrl = new URL(linkMatch[1]);
    } catch {
      throw new Error("Не удалось разобрать ссылку на статью.");
    }
    const article = await downloadArticle(startUrl);
    const notes = linkMatch[2]?.trim();
    if (notes) article.content = `${article.content}\n\nПримечание пользователя:\n${notes}`;
    return article;
  }

  return { title: titleFromText(raw), content: raw };
}
