/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConversationChunk,
  RelevanceQuery,
  PruningStats,
} from './types.js';

/**
 * Result of the pruning operation.
 */
export interface PruningResult {
  prunedChunks: ConversationChunk[];
  stats: PruningStats;
}

/**
 * Smart context pruner that implements greedy pruning by score-per-token ratio
 * while preserving conversation coherence and mandatory chunks.
 */
export class ContextPruner {
  /**
   * Prune chunks using greedy selection algorithm with coherence preservation.
   *
   * Algorithm:
   * 1. Identify mandatory chunks (pinned, system prompts, tool definitions)
   * 2. Calculate score-per-token ratio for remaining chunks
   * 3. Sort by ratio and greedily select until budget reached
   * 4. Apply coherence checks to maintain conversation flow
   *
   * @param chunks - All available chunks to consider
   * @param query - Current query for relevance scoring context
   * @param tokenBudget - Maximum tokens allowed in result
   * @returns Pruned chunks and statistics
   */
  pruneChunks(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    tokenBudget: number,
  ): PruningResult {
    const startTime = Date.now();

    // Handle edge cases
    if (chunks.length === 0) {
      return {
        prunedChunks: [],
        stats: this.createEmptyStats(startTime),
      };
    }

    if (tokenBudget <= 0) {
      const endTime = Date.now();
      return {
        prunedChunks: [],
        stats: this.createStats(chunks, [], startTime, endTime),
      };
    }

    // Check if all chunks fit within budget - if so, return them all in order
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
    if (totalTokens <= tokenBudget) {
      const sortedChunks = chunks.sort((a, b) => a.timestamp - b.timestamp);
      const endTime = Date.now();
      return {
        prunedChunks: sortedChunks,
        stats: this.createStats(chunks, sortedChunks, startTime, endTime),
      };
    }

    // Step 1: Identify mandatory chunks
    const mandatoryChunks = this.identifyMandatoryChunks(chunks);
    const candidateChunks = chunks.filter(
      (chunk) =>
        !mandatoryChunks.some((mandatory) => mandatory.id === chunk.id),
    );

    // Step 2: Calculate mandatory token usage
    const mandatoryTokens = mandatoryChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const remainingBudget = Math.max(0, tokenBudget - mandatoryTokens);

    // Step 3: Score and sort candidates by score-per-token ratio
    const scoredCandidates = this.scoreAndRankCandidates(candidateChunks);

    // Step 4: Greedily select candidates within budget
    const selectedCandidates = this.greedySelection(
      scoredCandidates,
      remainingBudget,
    );

    // Step 5: Combine mandatory and selected chunks
    const allSelectedChunks = [...mandatoryChunks, ...selectedCandidates];

    // Step 6: Apply coherence preservation (only if token budget allows)
    const coherentChunks = this.preserveCoherence(
      allSelectedChunks,
      chunks,
      tokenBudget,
    );

    // Step 7: Sort by original order (timestamp)
    const finalChunks = coherentChunks.sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    const endTime = Date.now();

    return {
      prunedChunks: finalChunks,
      stats: this.createStats(chunks, finalChunks, startTime, endTime),
    };
  }

  /**
   * Identify chunks that must be included regardless of score.
   */
  private identifyMandatoryChunks(
    chunks: ConversationChunk[],
  ): ConversationChunk[] {
    return chunks.filter(
      (chunk) =>
        chunk.metadata.pinned === true ||
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition'),
    );
  }

  /**
   * Score candidates and rank them by score-per-token ratio.
   */
  private scoreAndRankCandidates(
    chunks: ConversationChunk[],
  ): ConversationChunk[] {
    return chunks
      .map((chunk) => ({
        chunk,
        ratio: this.calculateScorePerTokenRatio(chunk),
      }))
      .sort((a, b) => b.ratio - a.ratio) // Descending order
      .map((item) => item.chunk);
  }

  /**
   * Calculate score-per-token ratio for a chunk.
   */
  private calculateScorePerTokenRatio(chunk: ConversationChunk): number {
    const score = chunk.metadata.finalScore ?? 0;
    const tokens = chunk.tokens;

    // Handle zero-token chunks
    if (tokens === 0) {
      return score; // Return raw score for zero-token chunks
    }

    return score / tokens;
  }

  /**
   * Greedily select chunks until budget is reached.
   */
  private greedySelection(
    sortedChunks: ConversationChunk[],
    budget: number,
  ): ConversationChunk[] {
    const selected: ConversationChunk[] = [];
    let remainingBudget = budget;

    for (const chunk of sortedChunks) {
      if (chunk.tokens <= remainingBudget) {
        selected.push(chunk);
        remainingBudget -= chunk.tokens;
      }

      // Stop if no budget remaining
      if (remainingBudget <= 0) {
        break;
      }
    }

    return selected;
  }

  /**
   * Preserve conversation coherence by maintaining role alternation
   * and thread ancestry.
   */
  private preserveCoherence(
    selectedChunks: ConversationChunk[],
    allChunks: ConversationChunk[],
    tokenBudget: number,
  ): ConversationChunk[] {
    // Sort selected chunks by timestamp to analyze conversation flow
    const sortedSelected = selectedChunks.sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const coherentChunks = [...sortedSelected];

    // Check current token usage
    const currentTokens = coherentChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const remainingBudget = tokenBudget - currentTokens;

    // Only add coherence chunks if we have budget remaining
    if (remainingBudget > 0) {
      // Add necessary chunks to prevent orphaned assistant responses
      const orphanedResponses = this.findOrphanedResponses(
        sortedSelected,
        allChunks,
      );

      // Add the user messages that precede orphaned assistant responses
      for (const orphaned of orphanedResponses) {
        const precedingUser = this.findPrecedingUserMessage(
          orphaned,
          allChunks,
        );
        if (
          precedingUser &&
          !coherentChunks.some((c) => c.id === precedingUser.id) &&
          precedingUser.tokens <= remainingBudget
        ) {
          coherentChunks.push(precedingUser);
        }
      }
    }

    return coherentChunks;
  }

  /**
   * Find assistant responses that don't have a preceding user message
   * in the selected chunks.
   */
  private findOrphanedResponses(
    selectedChunks: ConversationChunk[],
    _allChunks: ConversationChunk[],
  ): ConversationChunk[] {
    const sortedSelected = selectedChunks.sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const orphaned: ConversationChunk[] = [];

    for (const chunk of sortedSelected) {
      if (chunk.role === 'assistant') {
        // Check if there's a user message before this assistant response
        const hasPrecdingUser = sortedSelected.some(
          (c) => c.role === 'user' && c.timestamp < chunk.timestamp,
        );

        if (!hasPrecdingUser) {
          orphaned.push(chunk);
        }
      }
    }

    return orphaned;
  }

  /**
   * Find the user message that immediately precedes an assistant response.
   */
  private findPrecedingUserMessage(
    assistantChunk: ConversationChunk,
    allChunks: ConversationChunk[],
  ): ConversationChunk | undefined {
    const sortedChunks = allChunks.sort((a, b) => a.timestamp - b.timestamp);

    // Find the assistant chunk in the sorted list
    const assistantIndex = sortedChunks.findIndex(
      (c) => c.id === assistantChunk.id,
    );

    // Look backwards for the most recent user message
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (sortedChunks[i].role === 'user') {
        return sortedChunks[i];
      }
    }

    return undefined;
  }

  /**
   * Create empty statistics for edge cases.
   */
  private createEmptyStats(startTime: number): PruningStats {
    const endTime = Date.now();
    return {
      originalChunks: 0,
      prunedChunks: 0,
      originalTokens: 0,
      prunedTokens: 0,
      reductionPercentage: 0,
      processingTimeMs: endTime - startTime,
    };
  }

  /**
   * Create pruning statistics.
   */
  private createStats(
    originalChunks: ConversationChunk[],
    prunedChunks: ConversationChunk[],
    startTime: number,
    endTime?: number,
  ): PruningStats {
    const originalTokens = originalChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const prunedTokens = prunedChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const tokensReduced = originalTokens - prunedTokens;
    const reductionPercentage =
      originalTokens > 0
        ? Math.round((tokensReduced / originalTokens) * 100)
        : 0;

    return {
      originalChunks: originalChunks.length,
      prunedChunks: prunedChunks.length,
      originalTokens,
      prunedTokens,
      reductionPercentage,
      processingTimeMs: (endTime ?? Date.now()) - startTime,
    };
  }
}
