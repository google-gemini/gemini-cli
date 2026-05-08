/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, Content } from '@google/genai';
import {
  estimateTokenCountSync,
  MSG_OVERHEAD_TOKENS,
} from '../../utils/tokenCalculation.js';
import type { ConcreteNode } from '../graph/types.js';
import type { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';

/**
 * The flat token cost assigned to a single multi-modal asset (like an image tile)
 * by the Gemini API. We use this as a baseline heuristic for inlineData/fileData.
 */

export class ContextTokenCalculator {
  private readonly tokenCache = new Map<string, number>();

  constructor(
    private readonly charsPerToken: number,
    private readonly registry: NodeBehaviorRegistry,
  ) {}

  /**
   * Estimates tokens for a simple string based on character count.
   * Fast, but inherently inaccurate compared to real model tokenization.
   */
  estimateTokensForString(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Fast, simple heuristic conversion from tokens to expected character length.
   * Useful for calculating truncation thresholds.
   */
  tokensToChars(tokens: number): number {
    return tokens * this.charsPerToken;
  }

  /**
   * Pre-calculates and caches the token cost of a newly minted node.
   * Because nodes are immutable, this cost never changes for this node ID.
   */

  /**
   * Removes cached token counts for any nodes that are no longer in the given live set.
   * This prevents unbounded memory growth during long sessions.
   */
  garbageCollectCache(liveNodeIds: ReadonlySet<string>): void {
    for (const [id] of this.tokenCache) {
      if (!liveNodeIds.has(id)) {
        this.tokenCache.delete(id);
      }
    }
  }

  cacheNodeTokens(node: ConcreteNode): number {
    const behavior = this.registry.get(node.type);
    const parts = behavior.getEstimatableParts(node);
    const tokens = this.estimateTokensForParts(parts);
    this.tokenCache.set(node.id, tokens);
    return tokens;
  }

  /**
   * Retrieves the token cost of a single node from the cache.
   * If it misses the cache, it computes it and caches it.
   */
  getTokenCost(node: ConcreteNode): number {
    const cached = this.tokenCache.get(node.id);
    if (cached !== undefined) return cached;
    return this.cacheNodeTokens(node);
  }

  /**
   * Calculates a detailed breakdown of tokens by category for a list of nodes.
   * Useful for calibration tracing and debugging overestimation.
   */
  calculateTokenBreakdown(nodes: readonly ConcreteNode[]): {
    total: number;
    text: number;
    media: number;
    tool: number;
    overhead: number;
  } {
    const breakdown = { total: 0, text: 0, media: 0, tool: 0, overhead: 0 };
    const seenIds = new Set<string>();
    const seenTurnIds = new Set<string>();

    for (const node of nodes) {
      if (seenIds.has(node.id)) continue;
      seenIds.add(node.id);

      if (node.turnId) {
        if (!seenTurnIds.has(node.turnId)) {
          seenTurnIds.add(node.turnId);
          breakdown.overhead += MSG_OVERHEAD_TOKENS;
          breakdown.total += MSG_OVERHEAD_TOKENS;
        }
      }

      const cost = this.getTokenCost(node);
      breakdown.total += cost;

      const behavior = this.registry.get(node.type);
      const parts = behavior.getEstimatableParts(node);

      for (const part of parts) {
        if (typeof part.text === 'string') {
          breakdown.text += estimateTokenCountSync(
            [part],
            0,
            this.charsPerToken,
          );
        } else if (
          part.inlineData?.mimeType?.startsWith('image/') ||
          part.fileData?.mimeType?.startsWith('image/')
        ) {
          breakdown.media += estimateTokenCountSync(
            [part],
            0,
            this.charsPerToken,
          );
        } else if (part.functionCall || part.functionResponse) {
          breakdown.tool += estimateTokenCountSync(
            [part],
            0,
            this.charsPerToken,
          );
        } else {
          breakdown.overhead += estimateTokenCountSync(
            [part],
            0,
            this.charsPerToken,
          );
        }
      }
    }
    return breakdown;
  }

  /**
   * Fast calculation for a flat array of ConcreteNodes (The Nodes).
   * It relies entirely on the O(1) sidecar token cache.
   */
  calculateConcreteListTokens(nodes: readonly ConcreteNode[]): number {
    let tokens = 0;
    const seenIds = new Set<string>();
    const seenTurnIds = new Set<string>();

    for (const node of nodes) {
      if (!seenIds.has(node.id)) {
        seenIds.add(node.id);
        tokens += this.getTokenCost(node);

        if (node.turnId) {
          if (!seenTurnIds.has(node.turnId)) {
            seenTurnIds.add(node.turnId);
            tokens += MSG_OVERHEAD_TOKENS;
          }
        }
      }
    }
    return tokens;
  }

  /**
   * Calculates the token cost for a single Gemini Content object.
   */
  calculateContentTokens(content: Content): number {
    return (
      this.estimateTokensForParts(content.parts || []) + MSG_OVERHEAD_TOKENS
    );
  }

  /**
   * Slower, precise estimation for a Gemini Content/Part graph.
   * Deeply inspects the nested structure and uses the base tokenization math.
   */
  private readonly partTokenCache = new WeakMap<object, number>();

  estimateTokensForParts(parts: Part[]): number {
    let total = 0;
    for (const part of parts) {
      if (part !== null && typeof part === 'object') {
        let cost = this.partTokenCache.get(part);
        if (cost === undefined) {
          cost = estimateTokenCountSync([part], 0, this.charsPerToken);
          this.partTokenCache.set(part, cost);
        }
        total += cost;
      } else {
        total += estimateTokenCountSync([part], 0, this.charsPerToken);
      }
    }
    return total;
  }
}
