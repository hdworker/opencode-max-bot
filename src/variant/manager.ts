import { settingsManager } from "../settings/manager.js";

export interface VariantInfo {
  id: string;
  name: string;
}

class VariantManager {
  private variants: VariantInfo[] = [];
  private currentVariant: string | null = null;

  getVariants(): VariantInfo[] {
    return this.variants;
  }

  setVariants(variants: VariantInfo[]): void {
    this.variants = variants;
  }

  getCurrentVariant(): string | null {
    return this.currentVariant;
  }

  setCurrentVariant(variantId: string | null): void {
    this.currentVariant = variantId;
  }
}

export const variantManager = new VariantManager();
