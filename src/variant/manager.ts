import { conversationContext } from "../conversation/context.js";

export interface VariantInfo {
  id: string;
  name: string;
}

class VariantManager {
  private variants = new Map<number, VariantInfo[]>();

  getVariants(chatId: number): VariantInfo[] {
    return this.variants.get(chatId) ?? [];
  }

  setVariants(chatId: number, variants: VariantInfo[]): void {
    this.variants.set(chatId, variants);
  }

  getCurrentVariant(chatId: number): string | null {
    return conversationContext.get(chatId).variant;
  }

  setCurrentVariant(chatId: number, variantId: string | null): void {
    conversationContext.setVariant(chatId, variantId);
  }
}

export const variantManager = new VariantManager();
