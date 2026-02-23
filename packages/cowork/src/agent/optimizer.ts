/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Context Pruner and Model Tier selector — Phase 5.
 *
 * ContextPruner
 * ─────────────
 * Gemini's 2M-token window is generous but not infinite.  As the agentic loop
 * accumulates file contents and history, the context can grow to hundreds of
 * thousands of tokens, increasing latency and cost.
 *
 * The pruner uses a two-pass strategy:
 *   1. Deduplication   — remove near-identical code blocks (TF-IDF cosine ≥ 0.92).
 *   2. Relevance gating — score each block against the active goal; drop blocks
 *                         below a configurable threshold.
 *
 * ModelTier
 * ─────────
 * Not every task needs Gemini Pro.  Routing cheap tasks to Flash and expensive
 * reasoning to Pro saves ≈70 % on API costs for typical coding workflows.
 *
 *   Flash tasks  : read_file, write_file, shell_run, log_monitor
 *   Pro tasks    : search, screenshot_and_analyze, mcp_call, auto_test,
 *                  and any goal whose complexity score exceeds UPGRADE_THRESHOLD
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelId =
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-2.0-pro'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-pro';

export interface PruneResult {
  /** Pruned document text. */
  text: string;
  /** Number of blocks removed. */
  removedBlocks: number;
  /** Tokens saved (estimated at 4 chars/token). */
  savedTokens: number;
  /** Original token estimate. */
  originalTokens: number;
}

export interface ModelTierDecision {
  model: ModelId;
  reason: string;
  complexityScore: number;
}

export interface ContextBlock {
  id: string;
  header: string;
  body: string;
  relevanceScore: number;
  tokens: number;
}

// ---------------------------------------------------------------------------
// ContextPruner
// ---------------------------------------------------------------------------

const DEDUP_THRESHOLD = 0.92;   // cosine similarity above this → duplicate
const RELEVANCE_MIN = 0.08;     // blocks below this are dropped
const MAX_BLOCK_TOKENS = 8_000; // truncate single huge blocks

/**
 * Prunes the ProjectIndexer context document to reduce token consumption.
 *
 * ```ts
 * const pruner = new ContextPruner();
 * const result = await pruner.prune(contextDoc, 'Fix the broken auth module');
 * // result.savedTokens → e.g. 42 000
 * ```
 */
export class ContextPruner {
  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Prune `document` to maximize relevance to `goal`.
   *
   * Applies deduplication then relevance gating in a single pass.
   */
  prune(document: string, goal: string): PruneResult {
    const originalTokens = estimateTokens(document);
    const blocks = this.split(document);

    // Phase 1: score relevance
    const goalTokens = tokenize(goal);
    for (const block of blocks) {
      block.relevanceScore = this.scoreRelevance(block, goalTokens);
    }

    // Phase 2: deduplicate (remove later block when two are too similar)
    const kept: ContextBlock[] = [];
    for (const block of blocks) {
      const isDuplicate = kept.some(
        (k) => cosineSimilarity(tokenize(k.body), tokenize(block.body)) >= DEDUP_THRESHOLD,
      );
      if (!isDuplicate) kept.push(block);
    }

    // Phase 3: relevance gate
    const relevant = kept.filter(
      (b) => b.relevanceScore >= RELEVANCE_MIN || b.header.startsWith('##'),
    );

    // Phase 4: truncate oversized blocks
    for (const block of relevant) {
      if (block.tokens > MAX_BLOCK_TOKENS) {
        const limit = MAX_BLOCK_TOKENS * 4;
        block.body =
          block.body.slice(0, limit) +
          `\n\n… [truncated ${block.tokens - MAX_BLOCK_TOKENS} tokens by ContextPruner]`;
        block.tokens = MAX_BLOCK_TOKENS;
      }
    }

    const text = relevant.map((b) => `${b.header}\n${b.body}`).join('\n\n');
    const savedTokens = originalTokens - estimateTokens(text);

    return {
      text,
      removedBlocks: blocks.length - relevant.length,
      savedTokens: Math.max(0, savedTokens),
      originalTokens,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Split a ProjectIndexer-format document into header + body blocks.
   * Recognises `## ` markdown section headers as block boundaries.
   */
  private split(document: string): ContextBlock[] {
    const sections = document.split(/^## /m);
    return sections
      .filter((s) => s.trim().length > 0)
      .map((section, i) => {
        const nl = section.indexOf('\n');
        const header = nl === -1 ? `## ${section}` : `## ${section.slice(0, nl)}`;
        const body = nl === -1 ? '' : section.slice(nl + 1);
        return {
          id: `block-${i}`,
          header,
          body,
          relevanceScore: 0,
          tokens: estimateTokens(body),
        };
      });
  }

  private scoreRelevance(block: ContextBlock, goalTokens: Map<string, number>): number {
    const blockTokens = tokenize(block.header + ' ' + block.body.slice(0, 2000));
    return cosineSimilarity(goalTokens, blockTokens);
  }
}

// ---------------------------------------------------------------------------
// ModelTier
// ---------------------------------------------------------------------------

const FLASH_TOOLS = new Set([
  'read_file', 'write_file', 'shell_run', 'log_monitor',
]);

const PRO_TOOLS = new Set([
  'search', 'screenshot_and_analyze', 'mcp_call', 'auto_test',
]);

/** Complexity score above this threshold upgrades to Pro. */
const UPGRADE_THRESHOLD = 0.55;

/** Patterns that suggest architectural complexity. */
const COMPLEX_PATTERNS = [
  /\brefactor\b/i,
  /\barchitect\b/i,
  /\bdesign\b/i,
  /\bmigrat\b/i,
  /\boptimiz\b/i,
  /\bsecurity\b/i,
  /\bperformance\b/i,
  /\bscal\b/i,
  /\bauth(entication|oriz)?\b/i,
  /\bconcurren(cy|t)\b/i,
  /\bdistributed\b/i,
  /\bmicroservice\b/i,
  /\bapi\s+design\b/i,
  /\bschema\b/i,
  /\bdatabase\b/i,
  /\bdeployment\b/i,
];

/** Patterns that indicate simple, fast tasks. */
const SIMPLE_PATTERNS = [
  /^(read|list|show|print|display|get)\b/i,
  /\brename\b/i,
  /\bformat\b/i,
  /\blint\b/i,
  /\btypo\b/i,
  /\bcomment\b/i,
  /\bindent\b/i,
];

/**
 * Selects the appropriate Gemini model based on tool type and goal complexity.
 *
 * ```ts
 * const tier = new ModelTier();
 * const { model, reason } = tier.select('search', 'Find the latest React docs');
 * // → { model: 'gemini-2.0-pro', reason: 'search tool requires Pro grounding' }
 * ```
 */
export class ModelTier {
  constructor(
    private readonly flashModel: ModelId = 'gemini-2.0-flash',
    private readonly proModel: ModelId = 'gemini-2.0-pro',
  ) {}

  /**
   * Select a model for the given tool and goal.
   *
   * @param tool   The tool being invoked (or `null` for a think-only call).
   * @param goal   The active agent goal string.
   */
  select(tool: string | null, goal: string): ModelTierDecision {
    const complexityScore = this.scoreComplexity(goal);

    // Tool-based hard routing
    if (tool && PRO_TOOLS.has(tool)) {
      return {
        model: this.proModel,
        reason: `"${tool}" tool requires ${this.proModel} for best results`,
        complexityScore,
      };
    }

    if (tool && FLASH_TOOLS.has(tool)) {
      return {
        model: this.flashModel,
        reason: `"${tool}" is a simple I/O operation — using ${this.flashModel}`,
        complexityScore,
      };
    }

    // Complexity-based routing for think steps and unknown tools
    if (complexityScore >= UPGRADE_THRESHOLD) {
      return {
        model: this.proModel,
        reason: `Goal complexity score ${complexityScore.toFixed(2)} ≥ ${UPGRADE_THRESHOLD} — upgrading to ${this.proModel}`,
        complexityScore,
      };
    }

    return {
      model: this.flashModel,
      reason: `Goal complexity score ${complexityScore.toFixed(2)} < ${UPGRADE_THRESHOLD} — using ${this.flashModel}`,
      complexityScore,
    };
  }

  /**
   * Score goal complexity from 0 (trivial) to 1 (highly complex).
   * Combines keyword match counts and goal length heuristics.
   */
  scoreComplexity(goal: string): number {
    let score = 0;

    // Word count factor (longer goals tend to be more complex)
    const words = goal.trim().split(/\s+/).length;
    score += Math.min(0.2, words / 100);

    // Simple keyword penalty
    for (const re of SIMPLE_PATTERNS) {
      if (re.test(goal)) {
        score -= 0.1;
        break;
      }
    }

    // Complex keyword bonuses
    let complexMatches = 0;
    for (const re of COMPLEX_PATTERNS) {
      if (re.test(goal)) complexMatches++;
    }
    score += Math.min(0.6, complexMatches * 0.15);

    return Math.max(0, Math.min(1, score));
  }
}

// ---------------------------------------------------------------------------
// Helpers — TF-IDF + cosine similarity (no external dependencies)
// ---------------------------------------------------------------------------

/** Stopwords to exclude from TF-IDF. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'be', 'this', 'that',
  'it', 'as', 'if', 'not', 'no', 'so', 'do', 'did', 'has', 'have',
]);

/** Build a TF term-frequency map from text. */
function tokenize(text: string): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

/** Cosine similarity between two TF maps. Returns 0–1. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [k, v] of a) {
    magA += v * v;
    const bv = b.get(k) ?? 0;
    dot += v * bv;
  }
  for (const [, v] of b) {
    magB += v * v;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
