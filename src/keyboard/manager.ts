import type { InlineKeyboardAttachment, KeyboardButton } from "../max/client.js";

export interface KeyboardState {
  agent?: string;
  model?: string;
  variant?: string;
  context?: string;
}

class KeyboardManager {
  private state: KeyboardState = {};
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private onUpdate: ((state: KeyboardState) => void) | null = null;

  setUpdateCallback(callback: (state: KeyboardState) => void): void {
    this.onUpdate = callback;
  }

  setAgent(agent: string): void {
    this.state.agent = agent;
    this.scheduleUpdate();
  }

  setModel(model: string): void {
    this.state.model = model;
    this.scheduleUpdate();
  }

  setVariant(variant: string): void {
    this.state.variant = variant;
    this.scheduleUpdate();
  }

  setContext(context: string): void {
    this.state.context = context;
    this.scheduleUpdate();
  }

  getState(): KeyboardState {
    return { ...this.state };
  }

  buildKeyboard(): InlineKeyboardAttachment {
    const buttons: KeyboardButton[][] = [];

    if (this.state.agent) {
      buttons.push([
        { type: "callback", text: `Agent: ${this.state.agent}`, payload: "select_agent" },
      ]);
    }

    if (this.state.model) {
      buttons.push([
        { type: "callback", text: `Model: ${this.state.model}`, payload: "select_model" },
      ]);
    }

    if (this.state.variant) {
      buttons.push([
        { type: "callback", text: `Variant: ${this.state.variant}`, payload: "select_variant" },
      ]);
    }

    if (this.state.context) {
      buttons.push([
        { type: "callback", text: `Context: ${this.state.context}`, payload: "select_context" },
      ]);
    }

    return {
      type: "inline_keyboard",
      payload: { buttons },
    };
  }

  private scheduleUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => {
      this.onUpdate?.(this.state);
      this.updateTimer = null;
    }, 300);
  }
}

export const keyboardManager = new KeyboardManager();
