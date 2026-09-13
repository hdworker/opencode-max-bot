import { opencodeClient } from "../opencode/client.js";
import { withTimeout } from "../utils/with-timeout.js";

export const MAX_SESSION_INPUT_TOKENS = 120_000;

export function hasLargeSessionContext(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    if (typeof message !== "object" || message === null) return false;
    const tokens = (message as { tokens?: { input?: unknown } }).tokens;
    return typeof tokens?.input === "number" && tokens.input >= MAX_SESSION_INPUT_TOKENS;
  });
}

export async function isSessionContextTooLarge(
  sessionId: string,
  directory?: string,
): Promise<boolean> {
  try {
    const result = await withTimeout(
      opencodeClient.session.messages({
        sessionID: sessionId,
        directory,
        limit: 100,
      }),
      2_000,
    );
    return hasLargeSessionContext(result.data);
  } catch {
    // A guard must not make a healthy prompt impossible when the diagnostic
    // endpoint is unavailable or the server is already under pressure.
    return false;
  }
}
