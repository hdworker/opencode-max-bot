export const MAX_PROMPT_LENGTH = 4000;

export function isPromptTooLong(text: string): boolean {
  return text.length > MAX_PROMPT_LENGTH;
}
