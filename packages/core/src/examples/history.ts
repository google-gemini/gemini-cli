/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Example Execution History
 *
 * Tracks user interactions with examples, including when they were run,
 * success status, and user feedback. Supports persistent storage to disk.
 *
 * @module examples/history
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Example } from './types.js';

/**
 * Record of a single example execution
 */
export interface ExampleHistoryEntry {
  /** Example ID */
  exampleId: string;

  /** When the example was run */
  timestamp: number;

  /** Whether it was previewed or executed */
  action: 'preview' | 'run' | 'save';

  /** Context variables used (if any) */
  contextVars?: Record<string, string>;

  /** User rating (1-5 stars) */
  rating?: number;

  /** User notes */
  notes?: string;
}

/**
 * Statistics about example usage
 */
export interface ExampleUsageStats {
  /** Total number of executions */
  totalRuns: number;

  /** Total number of previews */
  totalPreviews: number;

  /** Most recently run examples */
  recentExamples: string[];

  /** Most frequently run examples */
  popularExamples: Array<{
    exampleId: string;
    runCount: number;
  }>;

  /** Examples saved as commands */
  savedCommands: Array<{
    exampleId: string;
    commandName: string;
  }>;

  /** Highest rated examples */
  topRated: Array<{
    exampleId: string;
    averageRating: number;
    ratingCount: number;
  }>;
}

/**
 * Get the default history file path
 */
function getHistoryFilePath(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.gemini-cli');
  return path.join(configDir, 'example-history.json');
}

/**
 * Manages example execution history with persistent storage
 */
export class ExampleHistory {
  private entries: ExampleHistoryEntry[] = [];
  private maxEntries = 1000;
  private filePath: string;
  private autoSave: boolean;

  constructor(filePath?: string, autoSave = true) {
    this.filePath = filePath || getHistoryFilePath();
    this.autoSave = autoSave;
    this.load(); // Auto-load on construction
  }

  /**
   * Record an example interaction
   */
  record(entry: ExampleHistoryEntry): void {
    this.entries.unshift(entry);

    // Keep only the most recent maxEntries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    // Auto-save if enabled
    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * Rate an example
   *
   * @param exampleId - Example to rate
   * @param rating - Rating from 1-5
   * @param notes - Optional notes about the rating
   */
  rate(exampleId: string, rating: number, notes?: string): void {
    // Validate rating
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Add a rating entry
    this.record({
      exampleId,
      timestamp: Date.now(),
      action: 'run', // Treat rating as a run event
      rating,
      notes,
    });
  }

  /**
   * Get all history entries
   */
  getAll(): ExampleHistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get history for a specific example
   */
  getForExample(exampleId: string): ExampleHistoryEntry[] {
    return this.entries.filter((e) => e.exampleId === exampleId);
  }

  /**
   * Get recent history (last N entries)
   */
  getRecent(limit = 10): ExampleHistoryEntry[] {
    return this.entries.slice(0, limit);
  }

  /**
   * Get usage statistics
   */
  getStats(): ExampleUsageStats {
    const runEntries = this.entries.filter((e) => e.action === 'run');
    const previewEntries = this.entries.filter((e) => e.action === 'preview');
    const saveEntries = this.entries.filter((e) => e.action === 'save');

    // Count runs per example
    const runCounts = new Map<string, number>();
    for (const entry of runEntries) {
      runCounts.set(entry.exampleId, (runCounts.get(entry.exampleId) || 0) + 1);
    }

    // Sort by run count
    const popularExamples = Array.from(runCounts.entries())
      .map(([exampleId, runCount]) => ({ exampleId, runCount }))
      .sort((a, b) => b.runCount - a.runCount)
      .slice(0, 10);

    // Get unique recent examples (last 20)
    const recentSet = new Set<string>();
    for (const entry of this.entries) {
      if (entry.action === 'run') {
        recentSet.add(entry.exampleId);
        if (recentSet.size >= 20) break;
      }
    }
    const recentExamples = Array.from(recentSet);

    // Get saved commands (extract from save entries - would need custom name storage)
    const savedCommands = saveEntries.map((entry) => ({
      exampleId: entry.exampleId,
      commandName: entry.notes || entry.exampleId, // Use notes field for command name
    }));

    // Calculate top-rated examples
    const ratings = new Map<string, number[]>();
    for (const entry of this.entries) {
      if (entry.rating) {
        const exampleRatings = ratings.get(entry.exampleId) || [];
        exampleRatings.push(entry.rating);
        ratings.set(entry.exampleId, exampleRatings);
      }
    }

    const topRated = Array.from(ratings.entries())
      .map(([exampleId, ratingArray]) => ({
        exampleId,
        averageRating:
          ratingArray.reduce((sum, r) => sum + r, 0) / ratingArray.length,
        ratingCount: ratingArray.length,
      }))
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 10);

    return {
      totalRuns: runEntries.length,
      totalPreviews: previewEntries.length,
      recentExamples,
      popularExamples,
      savedCommands,
      topRated,
    };
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.entries = [];
    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * Clear history for a specific example
   */
  clearForExample(exampleId: string): void {
    this.entries = this.entries.filter((e) => e.exampleId !== exampleId);
    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * Save history to disk
   */
  save(): void {
    try {
      const dirPath = path.dirname(this.filePath);

      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write history to file
      fs.writeFileSync(this.filePath, this.toJSON(), 'utf8');
    } catch (error) {
      // Silently fail if we can't save (e.g., permissions)
      console.error('Failed to save example history:', error);
    }
  }

  /**
   * Load history from disk
   */
  load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const json = fs.readFileSync(this.filePath, 'utf8');
        this.fromJSON(json);
      }
    } catch (error) {
      // Silently fail if we can't load
      console.error('Failed to load example history:', error);
    }
  }

  /**
   * Export history as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Load history from JSON
   */
  fromJSON(json: string): void {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        this.entries = parsed;
      }
    } catch (error) {
      // Invalid JSON, ignore
    }
  }
}

// Singleton instance
let historyInstance: ExampleHistory | null = null;

/**
 * Get the global example history instance
 */
export function getExampleHistory(): ExampleHistory {
  if (!historyInstance) {
    historyInstance = new ExampleHistory();
  }
  return historyInstance;
}

/**
 * Reset the history (mainly for testing)
 */
export function resetExampleHistory(): void {
  historyInstance = null;
}
