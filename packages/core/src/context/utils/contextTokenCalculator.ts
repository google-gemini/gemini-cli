/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';
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
   * Fast calculation for a flat array of ConcreteNodes (The Nodes).
   * It relies entirely on the O(1) sidecar token cache.
   */
  calculateConcreteListTokens(nodes: readonly ConcreteNode[]): number {
    let tokens = 0;
    for (const node of nodes) {
      tokens += this.getTokenCost(node);
    }
    return tokens;
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
