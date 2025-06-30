/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConversationChunk {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokens: number;
  timestamp: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  embedding?: number[];
  embeddingScore?: number;
  bm25Score?: number;
  recencyScore?: number;
  finalScore?: number;
  pinned?: boolean;
  summaryOf?: string;
  tags?: string[];
}

export interface ScoringWeights {
  embedding: number;
  bm25: number;
  recency: number;
  manual: number;
}

export interface ContextWindow {
  chunks: ConversationChunk[];
  totalTokens: number;
  maxTokens: number;
}

export interface ContextOptimizationConfig {
  enabled: boolean;
  maxChunks: number;
  embeddingEnabled: boolean;
  aggressivePruning: boolean;
  scoringWeights: ScoringWeights;
}

export interface RelevanceQuery {
  text: string;
  role?: 'user' | 'assistant' | 'tool';
  timestamp?: number;
  tags?: string[];
}

export interface ScoringResult {
  chunkId: string;
  score: number;
  breakdown: {
    embedding?: number;
    bm25?: number;
    recency?: number;
    manual?: number;
  };
}

export interface PruningStats {
  originalChunks: number;
  prunedChunks: number;
  originalTokens: number;
  prunedTokens: number;
  reductionPercentage: number;
  processingTimeMs: number;
}