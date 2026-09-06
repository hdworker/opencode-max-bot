const stores = new Map<number, Map<string, string>>();

function getStore(chatId: number): Map<string, string> {
  let store = stores.get(chatId);
  if (!store) {
    store = new Map();
    stores.set(chatId, store);
  }
  return store;
}

export function clearFileCallbacks(chatId: number): void {
  stores.delete(chatId);
}

export function rememberFileCallback(chatId: number, path: string): string {
  const token = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  getStore(chatId).set(token, path);
  return token;
}

export function resolveFileCallback(chatId: number, token: string): string | null {
  return getStore(chatId).get(token) ?? null;
}
