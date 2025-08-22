/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EmbeddingConfig } from './types.js';
import { DEFAULT_MODEL } from './constants.js';

export class EmbeddingService {
  private readonly config: EmbeddingConfig;
  private embeddingDimension: number = 768;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      endpoint: config.endpoint || 'http://localhost:11434/v1/embeddings',
      apiKey: config.apiKey,
      model: config.model || DEFAULT_MODEL,
      batchSize: config.batchSize || 32
    };
  }

  async generateEmbeddings(texts: string[], onProgress?: (current: number, total: number) => void): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const batchEmbeddings = await this.processBatch(batch);
      results.push(...batchEmbeddings);
      
      onProgress?.(results.length, texts.length);
    }

    return results;
  }

  private async processBatch(texts: string[]): Promise<number[][]> {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.callEmbeddingsAPI(texts);
      } catch (error) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    console.warn(`Batch request failed after ${maxRetries} attempts, falling back to single requests`);
    return await this.fallbackToSingleRequests(texts);
  }

  private async callEmbeddingsAPI(texts: string[]): Promise<number[][]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const payload = {
      model: this.config.model,
      input: texts
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseEmbeddingsResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async fallbackToSingleRequests(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    
    for (const text of texts) {
      try {
        const singleResult = await this.callEmbeddingsAPI([text]);
        results.push(singleResult[0]);
      } catch (error) {
        console.warn(`Failed to generate embedding for a text unit after multiple retries. Skipping. Error: ${error}`);
      }
    }

    return results;
  }

  private parseEmbeddingsResponse(data: any): number[][] {
    let embeddings: number[][];
    
    if (data.data && Array.isArray(data.data)) {
      embeddings = data.data.map((item: any) => {
        if (item.embedding && Array.isArray(item.embedding)) {
          return item.embedding;
        }
        throw new Error('Invalid embedding format in data array');
      });
    } else if (data.embeddings && Array.isArray(data.embeddings)) {
      embeddings = data.embeddings;
    } else if (Array.isArray(data)) {
      embeddings = data;
    } else if (data.embedding && Array.isArray(data.embedding)) {
      embeddings = [data.embedding];
    } else {
      throw new Error(`Unknown embeddings response format: ${JSON.stringify(data).substring(0, 300)}`);
    }
    
    if (embeddings.length > 0 && embeddings[0].length > 0) {
      this.embeddingDimension = embeddings[0].length;
    }
    
    return embeddings;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getEmbeddings(texts: string[], onProgress?: (current: number, total: number) => void): Promise<number[][]> {
    return this.generateEmbeddings(texts, onProgress);
  }
}
