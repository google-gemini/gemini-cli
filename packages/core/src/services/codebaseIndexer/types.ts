/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FileInfo {
  path: string;
  isText: boolean;
  size: number;
  mtime: Date;
}

export interface ScanStats {
  totalFiles: number;
  textFiles: number;
  binaryFiles: number;
  largeFiles: number;
  excludedFiles: number;
}

export interface TextUnit {
  id: string;
  relpath: string;
  lineno: number;
  start_char: number;
  text: string;
}

export interface FileIndex {
  sha: string;
  relpath: string;
  units: TextUnit[];
  embeddings: number[][];
  mtime: Date;
  size: number;
}

export interface IndexStatus {
  exists: boolean;
  fileCount?: number;
  vectorCount?: number;
  lastUpdated?: Date;
  sizeBytes?: number;
}

export interface EmbeddingConfig {
  endpoint: string;
  apiKey?: string;
  model: string;
  batchSize: number;
}

export interface IndexConfig {
  embedEndpoint: string;
  apiKey?: string;
  batchSize: number;
  maxTextChars: number;
  mergeThreshold: number;
  skipIfLargerThan: number;
  excludePatterns: string[];
  includePatterns: string[];
  respectGeminiIgnore: boolean;
}

export interface IndexProgress {
  phase: 'scanning' | 'processing' | 'embedding' | 'building_index' | 'saving' | 'complete';
  currentFile?: string;
  processedFiles: number;
  totalFiles: number;
  currentBatch?: number;
  totalBatches?: number;
  currentVector?: number;
  totalVectors?: number;
  currentEmbedding?: number;
  totalEmbeddings?: number;
  stats: ScanStats;
  message?: string;
  detail?: string;
}

export interface IndexResult {
  success: boolean;
  stats: ScanStats;
  totalVectors: number;
  indexSize: number;
  duration: number;
  errors: string[];
  isReindex?: boolean;
}
