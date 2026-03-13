/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Search tool for Gemini Cowork.
 *
 * Wraps Gemini 2.0's native Google Search grounding capability. Rather than
 * making raw HTTP requests to a search API, we instruct Gemini to answer the
 * query using real-time grounding — the same mechanism used by gemini-cli-core's
 * `WebSearchTool` (see packages/core/src/tools/web-search.ts).
 *
 * Prerequisites
 * ─────────────
 *   GEMINI_API_KEY – required
 *   Grounding is only available with Gemini 2.x models.
 */

import { GoogleGenAI } from '@google/genai';
import type { GroundingMetadata } from '@google/genai';
import type { SearchInput } from './definitions.js';
import type { ToolResult } from './executor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract URLs from the grounding metadata returned by Gemini. */
function extractSources(meta: GroundingMetadata | undefined): string[] {
  if (!meta?.groundingChunks) return [];
  const urls: string[] = [];
  for (const chunk of meta.groundingChunks) {
    if (chunk.web?.uri) urls.push(chunk.web.uri);
  }
  return [...new Set(urls)]; // deduplicate
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a Google Search via Gemini's grounding tool and return a structured
 * natural-language summary with source URLs.
 *
 * The `googleSearch: {}` tool declaration signals to the Gemini API that the
 * model is permitted to query Google in real time before generating its answer.
 */
export async function executeSearch(input: SearchInput): Promise<ToolResult> {
  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Google Search grounding requires a Gemini API key.',
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const numResults = input.numResults ?? 5;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Answer the following search query using real-time Google Search results. ` +
              `Summarise the most relevant ${numResults} findings concisely, ` +
              `citing source URLs inline where possible.\n\n` +
              `Query: ${input.query}`,
          },
        ],
      },
    ],
    config: {
      // Enables real-time Google Search grounding in Gemini 2.x.
      tools: [{ googleSearch: {} }],
    },
  });

  const answer = response.text ?? '(No answer returned)';

  // Append deduplicated grounding sources as a footer.
  const groundingMeta = response.candidates?.[0]?.groundingMetadata;
  const sources = extractSources(groundingMeta);
  const sourcesSection =
    sources.length > 0
      ? `\n\n--- Sources ---\n${sources.map((u) => `• ${u}`).join('\n')}`
      : '';

  return { output: answer + sourcesSection };
}
