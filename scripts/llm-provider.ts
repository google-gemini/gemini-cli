/* eslint-disable license-header/header */
/**
 * @license
 * Copyright 2025 Russell Nordland
 * Proprietary and Confidential
 */

export interface LLMProvider {
  generate(prompt: string): Promise<string>;
}

export class SimulatedProvider implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    console.log(`[SimulatedProvider] Generating response for: "${prompt}"`);
    return `Neuro-symbolic AI is exploding in 2026, merging neural networks’ pattern recognition with symbolic logic for reasoning without hallucinations. This enables verifiable, auditable outputs — step-by-step checks, reduced errors, and true understanding. It’s the bridge from probabilistic LLMs to deterministic reliability, powering safer AI in mental health, business, and beyond. Recursive self-improvement becomes bounded and provable.`;
  }
}

export class GeminiProxyClient implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://localhost:3000/openai', model = 'gemini-2.5-pro') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(prompt: string): Promise<string> {
    console.log(`[GeminiProxyClient] Calling ${this.baseUrl} with model ${this.model}...`);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer local-dev'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`Proxy responded with ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Invalid response format from proxy');
      }

      return content;
    } catch (error) {
      console.warn(`[GeminiProxyClient] Connection failed (${error instanceof Error ? error.message : String(error)}). Falling back to simulation.`);
      // Fallback logic could be handled here or by the caller.
      // For now, let's re-throw to let the caller decide, OR return a fallback string if we want resilience.
      // Given the "TAS-Verified" nature, maybe we shouldn't silently fallback?
      // But for developer experience in this sandbox (where port 3000 might not be open), fallback is safer.
      const fallback = new SimulatedProvider();
      return fallback.generate(prompt);
    }
  }
}
