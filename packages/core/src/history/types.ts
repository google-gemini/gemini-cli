/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CommandHistoryEntry {
  id: string;
  timestamp: number;
  command: string;
  args: string;
  workingDirectory: string;
  status: 'success' | 'error' | 'cancelled';
  duration: number;
  output?: string;
  error?: string;
  tags: string[];
  bookmarked: boolean;
  rating?: number;
  notes?: string;
}

export interface SearchQuery {
  text?: string;
  tags?: string[];
  bookmarked?: boolean;
  status?: 'success' | 'error' | 'cancelled';
  minRating?: number;
  startDate?: number;
  endDate?: number;
  workingDirectory?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  entries: CommandHistoryEntry[];
  total: number;
  hasMore: boolean;
}

export interface HistoryStats {
  totalCommands: number;
  successCount: number;
  errorCount: number;
  cancelledCount: number;
  averageDuration: number;
  totalDuration: number;
  bookmarkedCount: number;
  taggedCount: number;
  annotatedCount: number;
  topCommands: Array<{ command: string; count: number }>;
  topTags: Array<{ tag: string; count: number }>;
  commandsByDay: Record<string, number>;
  successRate: number;
}

export interface CommandPattern {
  pattern: string;
  frequency: number;
  lastUsed: number;
  avgDuration: number;
  successRate: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'markdown';
  includeOutput?: boolean;
  includeNotes?: boolean;
  startDate?: number;
  endDate?: number;
  filter?: SearchQuery;
}
