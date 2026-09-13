export type PromptFailureKind =
  | "opencode-unavailable"
  | "opencode-timeout"
  | "opencode-disconnected"
  | "max-timeout"
  | "aborted"
  | "unknown";

function errorChain(error: unknown): unknown[] {
  const result: unknown[] = [];
  let current = error;
  while (current && !result.includes(current)) {
    result.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return result;
}

export function classifyPromptFailure(error: unknown): PromptFailureKind {
  const chain = errorChain(error);
  const codes = new Set(
    chain
      .filter((item): item is { code?: unknown } => typeof item === "object" && item !== null)
      .map((item) => item.code),
  );
  const names = new Set(
    chain
      .filter((item): item is { name?: unknown } => typeof item === "object" && item !== null)
      .map((item) => item.name),
  );
  const text = chain
    .map((item) => (item instanceof Error ? item.message : String(item)))
    .join(" ")
    .toLowerCase();

  if (codes.has("ECONNREFUSED")) return "opencode-unavailable";
  if (codes.has("UND_ERR_HEADERS_TIMEOUT") || text.includes("headers timeout")) {
    return "opencode-timeout";
  }
  if (
    codes.has("UND_ERR_SOCKET") ||
    names.has("SocketError") ||
    text.includes("other side closed") ||
    text.includes("socket")
  ) {
    return "opencode-disconnected";
  }
  if (names.has("AbortError")) return "aborted";
  return "unknown";
}

export function classifyMaxApiFailure(error: unknown): PromptFailureKind {
  const chain = errorChain(error);
  const codes = new Set(
    chain
      .filter((item): item is { code?: unknown } => typeof item === "object" && item !== null)
      .map((item) => item.code),
  );
  const names = new Set(
    chain
      .filter((item): item is { name?: unknown } => typeof item === "object" && item !== null)
      .map((item) => item.name),
  );

  if (codes.has("UND_ERR_HEADERS_TIMEOUT")) return "max-timeout";
  if (names.has("AbortError")) return "aborted";
  return "unknown";
}

export function promptFailureMessage(kind: PromptFailureKind): string {
  switch (kind) {
    case "opencode-unavailable":
      return "❌ OpenCode сейчас недоступен. Повторите запрос через несколько секунд или создайте новую сессию.";
    case "opencode-timeout":
      return "❌ OpenCode не ответил вовремя. Запрос остановлен. Повторите его в новой сессии, если эта большая.";
    case "opencode-disconnected":
      return "❌ Соединение с OpenCode разорвано. Запрос остановлен. Повторите позже.";
    case "max-timeout":
      return "❌ MAX API не ответил вовремя. Запрос завершён, бот продолжает работу. Повторите позже.";
    case "aborted":
      return "❌ Запрос был прерван. Можно отправить его снова.";
    default:
      return "❌ Не удалось отправить prompt. Запрос завершён; попробуйте ещё раз.";
  }
}
