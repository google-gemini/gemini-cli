declare module 'bidi-js' {
  export interface BidiEmbeddingLevels {
    levels: Uint8Array;
    paragraphs: Array<{
      start: number;
      end: number;
      level: number;
    }>;
  }

  export interface BidiInstance {
    getEmbeddingLevels(
      text: string,
      direction?: 'ltr' | 'rtl' | 'auto',
    ): BidiEmbeddingLevels;
    getReorderedIndices(text: string, levels: Uint8Array): Uint32Array;
    getReorderedString(
      text: string,
      embeddingLevels: BidiEmbeddingLevels,
    ): string;
  }

  export default function bidiFactory(): BidiInstance;
}
