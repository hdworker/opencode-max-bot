export function isExpectedOpencodeUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  const expectedPatterns = [
    "econnrefused",
    "econnreset",
    "socket hang up",
    "connect timed out",
    "fetch failed",
    "network",
    "server unavailable",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
  ];

  return expectedPatterns.some((pattern) => message.includes(pattern));
}
