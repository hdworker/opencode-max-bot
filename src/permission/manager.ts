export interface PermissionRequest {
  id: string;
  sessionId: string;
  message: string;
  patterns?: string[];
  messageId?: number;
}

class PermissionManager {
  private requests = new Map<string, PermissionRequest>();
  private messageToId = new Map<number, string>();

  add(request: PermissionRequest): void {
    this.requests.set(request.id, request);
    if (request.messageId) {
      this.messageToId.set(request.messageId, request.id);
    }
  }

  get(id: string): PermissionRequest | undefined {
    return this.requests.get(id);
  }

  getByMessageId(messageId: number): PermissionRequest | undefined {
    const id = this.messageToId.get(messageId);
    return id ? this.requests.get(id) : undefined;
  }

  remove(id: string): void {
    const request = this.requests.get(id);
    if (request?.messageId) {
      this.messageToId.delete(request.messageId);
    }
    this.requests.delete(id);
  }

  hasPending(): boolean {
    return this.requests.size > 0;
  }

  clear(): void {
    this.requests.clear();
    this.messageToId.clear();
  }
}

export const permissionManager = new PermissionManager();
