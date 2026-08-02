export interface FileChange {
  path: string;
  type: "add" | "modify" | "delete";
  additions?: number;
  deletions?: number;
}

class PinnedMessageManager {
  private currentMessageId: number | null = null;
  private text: string = "";

  setMessageId(messageId: number | null): void {
    this.currentMessageId = messageId;
  }

  getMessageId(): number | null {
    return this.currentMessageId;
  }

  setText(text: string): void {
    this.text = text;
  }

  getText(): string {
    return this.text;
  }

  clear(): void {
    this.currentMessageId = null;
    this.text = "";
  }
}

export const pinnedMessageManager = new PinnedMessageManager();
