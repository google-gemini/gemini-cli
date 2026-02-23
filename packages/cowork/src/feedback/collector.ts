/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Feedback Collector and Few-Shot Prompting Pipeline — Phase 5.
 *
 * When a user manually corrects the agent's output (wrong file content, bad
 * command, incorrect analysis), this module:
 *   1. Persists the (original, correction) pair to `.cowork/feedback.jsonl`.
 *   2. On subsequent runs, retrieves the top-K most relevant pairs via TF-IDF
 *      cosine similarity and formats them as few-shot examples injected into
 *      the system prompt.
 *
 * This creates a continuous learning loop tailored to the user's coding style:
 *
 *   Session 1 → agent writes bad code → user corrects → pair saved
 *   Session 2 → similar goal detected → pair retrieved → injected into prompt
 *               → agent produces style-matched output from the start
 *
 * Storage format (.cowork/feedback.jsonl)
 * ────────────────────────────────────────
 *   {"id":"...","ts":"...","goal":"...","context":"...","original":"...",
 *    "correction":"...","accepted":true,"category":"code_style"}
 */

import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackCategory =
  | 'code_style'        // formatting, naming conventions
  | 'logic_error'       // incorrect logic fixed by user
  | 'missing_context'   // agent lacked important context
  | 'wrong_tool'        // agent chose the wrong tool
  | 'hallucination'     // agent invented non-existent APIs / files
  | 'security'          // agent produced insecure code
  | 'other';

export interface FeedbackPair {
  /** Stable UUID for this pair. */
  id: string;
  /** ISO 8601 timestamp of when the correction was recorded. */
  ts: string;
  /** The active agent goal when the pair was captured. */
  goal: string;
  /**
   * Compact context snapshot (e.g. the file path + function name being edited)
   * to help with future retrieval.
   */
  context: string;
  /** What the agent originally produced (the "wrong answer"). */
  original: string;
  /** What the user corrected it to (the "right answer"). */
  correction: string;
  /** Whether the corrected version was accepted into the codebase. */
  accepted: boolean;
  category: FeedbackCategory;
}

export interface FewShotExample {
  pair: FeedbackPair;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// FeedbackCollector
// ---------------------------------------------------------------------------

/**
 * Records correction pairs and retrieves them as few-shot prompt examples.
 *
 * ```ts
 * const collector = new FeedbackCollector('/project/.cowork/feedback.jsonl');
 *
 * // After user edits agent output:
 * await collector.record({
 *   goal: 'Add input validation to the login form',
 *   context: 'src/auth/login.ts:validatePassword()',
 *   original: 'if (password.length < 6) throw new Error(...)',
 *   correction: 'if (!isStrongPassword(password)) throw new ValidationError(...)',
 *   accepted: true,
 *   category: 'code_style',
 * });
 *
 * // On the next run:
 * const examples = await collector.buildFewShotExamples('Add registration form validation', 3);
 * const systemPromptAddition = collector.formatAsSystemPrompt(examples);
 * ```
 */
export class FeedbackCollector {
  constructor(private readonly datasetPath: string) {}

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Record a new correction pair.  Appended atomically to the JSONL file.
   */
  async record(
    input: Omit<FeedbackPair, 'id' | 'ts'>,
  ): Promise<FeedbackPair> {
    const pair: FeedbackPair = {
      id: shortHash(`${input.goal}${input.original}${Date.now()}`),
      ts: new Date().toISOString(),
      ...input,
    };

    await appendFile(this.datasetPath, JSON.stringify(pair) + '\n', 'utf-8');
    return pair;
  }

  // ── Read & retrieve ───────────────────────────────────────────────────────

  /** Load all stored pairs from the JSONL file. */
  async loadAll(): Promise<FeedbackPair[]> {
    if (!existsSync(this.datasetPath)) return [];
    try {
      const raw = await readFile(this.datasetPath, 'utf-8');
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as FeedbackPair);
    } catch {
      return [];
    }
  }

  /**
   * Retrieve the top-K most relevant correction pairs for `goal`.
   *
   * Relevance is computed as TF-IDF cosine similarity between the goal and
   * the stored pair's `goal + context` fields.
   * Pairs with `accepted: false` are down-weighted by 50 %.
   */
  async buildFewShotExamples(goal: string, k = 5): Promise<FewShotExample[]> {
    const pairs = await this.loadAll();
    if (pairs.length === 0) return [];

    const goalVec = tokenize(goal);

    const scored = pairs.map((pair) => {
      const pairText = `${pair.goal} ${pair.context}`;
      const pairVec = tokenize(pairText);
      let score = cosineSimilarity(goalVec, pairVec);
      if (!pair.accepted) score *= 0.5;
      return { pair, relevanceScore: score };
    });

    return scored
      .filter((e) => e.relevanceScore > 0.05)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, k);
  }

  // ── Prompt formatting ─────────────────────────────────────────────────────

  /**
   * Format few-shot examples as a system-prompt block injected before the
   * agent's task description.
   *
   * Example output:
   * ```
   * ## Coding Style Examples (from your past corrections)
   *
   * ### Example 1 — code_style  [context: src/auth/login.ts:validatePassword()]
   * ❌ Original:
   *   if (password.length < 6) throw new Error(...)
   * ✅ Correction:
   *   if (!isStrongPassword(password)) throw new ValidationError(...)
   * ```
   */
  formatAsSystemPrompt(examples: FewShotExample[]): string {
    if (examples.length === 0) return '';

    const lines = [
      '## Coding Style Examples (learned from your past corrections)',
      '',
      'The following examples show patterns YOU have corrected before.',
      'Apply the same style and approach in your current task.',
      '',
    ];

    examples.forEach(({ pair }, i) => {
      lines.push(
        `### Example ${i + 1} — ${pair.category}  [context: ${pair.context}]`,
        '❌ Original:',
        ...pair.original.split('\n').map((l) => `  ${l}`),
        '✅ Correction:',
        ...pair.correction.split('\n').map((l) => `  ${l}`),
        '',
      );
    });

    return lines.join('\n');
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  /** Return category breakdown of the stored dataset. */
  async stats(): Promise<Partial<Record<FeedbackCategory, number>>> {
    const pairs = await this.loadAll();
    const counts: Partial<Record<FeedbackCategory, number>> = {};
    for (const p of pairs) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'are', 'was', 'be', 'it', 'as', 'if', 'not',
]);

function tokenize(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [k, v] of a) { magA += v * v; dot += v * (b.get(k) ?? 0); }
  for (const [, v] of b) { magB += v * v; }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}
