/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  CommandHistoryEntry,
  SearchQuery,
  SearchResult,
  HistoryStats,
  CommandPattern,
  ExportOptions,
} from './types.js';

function getHistoryDbPath(): string {
  return path.join(os.homedir(), '.gemini-cli', 'history.json');
}

export class CommandHistoryEngine {
  private entries: CommandHistoryEntry[] = [];
  private dbPath: string;
  private nextId: number = 1;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || getHistoryDbPath();
    this.loadDatabase();
  }

  addEntry(entry: Omit<CommandHistoryEntry, 'id'>): CommandHistoryEntry {
    const fullEntry: CommandHistoryEntry = {
      ...entry,
      id: this.nextId.toString(),
      tags: entry.tags || [],
      bookmarked: entry.bookmarked || false,
    };

    this.nextId++;
    this.entries.unshift(fullEntry); // Add to beginning for chronological order
    this.saveDatabase();

    return fullEntry;
  }

  getEntry(id: string): CommandHistoryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  search(query: SearchQuery): SearchResult {
    let results = [...this.entries];

    // Text search in command and args
    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(
        (e) =>
          e.command.toLowerCase().includes(searchText) ||
          e.args.toLowerCase().includes(searchText) ||
          (e.output && e.output.toLowerCase().includes(searchText)) ||
          (e.notes && e.notes.toLowerCase().includes(searchText)),
      );
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter((e) =>
        query.tags!.some((tag) => e.tags.includes(tag)),
      );
    }

    // Filter by bookmarked
    if (query.bookmarked !== undefined) {
      results = results.filter((e) => e.bookmarked === query.bookmarked);
    }

    // Filter by status
    if (query.status) {
      results = results.filter((e) => e.status === query.status);
    }

    // Filter by rating
    if (query.minRating !== undefined) {
      results = results.filter(
        (e) => e.rating !== undefined && e.rating >= query.minRating!,
      );
    }

    // Filter by date range
    if (query.startDate) {
      results = results.filter((e) => e.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter((e) => e.timestamp <= query.endDate!);
    }

    // Filter by working directory
    if (query.workingDirectory) {
      results = results.filter((e) =>
        e.workingDirectory.includes(query.workingDirectory!),
      );
    }

    const total = results.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      entries: paginatedResults,
      total,
      hasMore: offset + limit < total,
    };
  }

  addTag(id: string, tag: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    if (!entry.tags.includes(tag)) {
      entry.tags.push(tag);
      this.saveDatabase();
    }
  }

  removeTag(id: string, tag: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    entry.tags = entry.tags.filter((t) => t !== tag);
    this.saveDatabase();
  }

  bookmark(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    entry.bookmarked = true;
    this.saveDatabase();
  }

  unbookmark(id: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    entry.bookmarked = false;
    this.saveDatabase();
  }

  rate(id: string, rating: number): void {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    entry.rating = rating;
    this.saveDatabase();
  }

  addNote(id: string, note: string): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Entry not found: ${id}`);

    entry.notes = note;
    this.saveDatabase();
  }

  getStats(): HistoryStats {
    const totalCommands = this.entries.length;
    const successCount = this.entries.filter((e) => e.status === 'success').length;
    const errorCount = this.entries.filter((e) => e.status === 'error').length;
    const cancelledCount = this.entries.filter(
      (e) => e.status === 'cancelled',
    ).length;

    const durations = this.entries.map((e) => e.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalCommands > 0 ? totalDuration / totalCommands : 0;

    const bookmarkedCount = this.entries.filter((e) => e.bookmarked).length;
    const taggedCount = this.entries.filter((e) => e.tags.length > 0).length;
    const annotatedCount = this.entries.filter((e) => e.notes).length;

    // Top commands
    const commandCounts: Record<string, number> = {};
    this.entries.forEach((e) => {
      commandCounts[e.command] = (commandCounts[e.command] || 0) + 1;
    });
    const topCommands = Object.entries(commandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([command, count]) => ({ command, count }));

    // Top tags
    const tagCounts: Record<string, number> = {};
    this.entries.forEach((e) => {
      e.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Commands by day
    const commandsByDay: Record<string, number> = {};
    this.entries.forEach((e) => {
      const date = new Date(e.timestamp).toISOString().split('T')[0];
      commandsByDay[date] = (commandsByDay[date] || 0) + 1;
    });

    const successRate = totalCommands > 0 ? (successCount / totalCommands) * 100 : 0;

    return {
      totalCommands,
      successCount,
      errorCount,
      cancelledCount,
      averageDuration,
      totalDuration,
      bookmarkedCount,
      taggedCount,
      annotatedCount,
      topCommands,
      topTags,
      commandsByDay,
      successRate,
    };
  }

  detectPatterns(): CommandPattern[] {
    const patterns: Record<string, CommandPattern> = {};

    this.entries.forEach((e) => {
      const pattern = e.command;
      if (!patterns[pattern]) {
        patterns[pattern] = {
          pattern,
          frequency: 0,
          lastUsed: e.timestamp,
          avgDuration: 0,
          successRate: 0,
        };
      }

      const p = patterns[pattern];
      p.frequency++;
      p.lastUsed = Math.max(p.lastUsed, e.timestamp);
    });

    // Calculate avgDuration and successRate
    Object.keys(patterns).forEach((pattern) => {
      const entries = this.entries.filter((e) => e.command === pattern);
      const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
      const successCount = entries.filter((e) => e.status === 'success').length;

      patterns[pattern].avgDuration = totalDuration / entries.length;
      patterns[pattern].successRate = (successCount / entries.length) * 100;
    });

    return Object.values(patterns).sort((a, b) => b.frequency - a.frequency);
  }

  export(options: ExportOptions): string {
    let entries = this.entries;

    // Apply filter
    if (options.filter) {
      const result = this.search(options.filter);
      entries = result.entries;
    }

    // Apply date range
    if (options.startDate) {
      entries = entries.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options.endDate) {
      entries = entries.filter((e) => e.timestamp <= options.endDate!);
    }

    switch (options.format) {
      case 'json':
        return this.exportJSON(entries, options);
      case 'csv':
        return this.exportCSV(entries, options);
      case 'markdown':
        return this.exportMarkdown(entries, options);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  private exportJSON(
    entries: CommandHistoryEntry[],
    options: ExportOptions,
  ): string {
    const data = entries.map((e) => {
      const entry: any = {
        id: e.id,
        timestamp: e.timestamp,
        date: new Date(e.timestamp).toISOString(),
        command: e.command,
        args: e.args,
        workingDirectory: e.workingDirectory,
        status: e.status,
        duration: e.duration,
        tags: e.tags,
        bookmarked: e.bookmarked,
      };

      if (e.rating) entry.rating = e.rating;
      if (options.includeOutput && e.output) entry.output = e.output;
      if (e.error) entry.error = e.error;
      if (options.includeNotes && e.notes) entry.notes = e.notes;

      return entry;
    });

    return JSON.stringify(data, null, 2);
  }

  private exportCSV(entries: CommandHistoryEntry[], options: ExportOptions): string {
    const headers = [
      'ID',
      'Timestamp',
      'Date',
      'Command',
      'Args',
      'Directory',
      'Status',
      'Duration',
      'Tags',
      'Bookmarked',
      'Rating',
    ];

    if (options.includeOutput) headers.push('Output');
    if (options.includeNotes) headers.push('Notes');

    const rows = entries.map((e) => {
      const row = [
        e.id,
        e.timestamp.toString(),
        new Date(e.timestamp).toISOString(),
        e.command,
        e.args,
        e.workingDirectory,
        e.status,
        e.duration.toString(),
        e.tags.join(';'),
        e.bookmarked.toString(),
        e.rating?.toString() || '',
      ];

      if (options.includeOutput) row.push(e.output || '');
      if (options.includeNotes) row.push(e.notes || '');

      return row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  private exportMarkdown(
    entries: CommandHistoryEntry[],
    options: ExportOptions,
  ): string {
    const lines = ['# Command History', '', `Exported: ${new Date().toISOString()}`, ''];

    entries.forEach((e) => {
      lines.push(`## ${e.command} ${e.args}`);
      lines.push('');
      lines.push(`- **ID**: ${e.id}`);
      lines.push(`- **Date**: ${new Date(e.timestamp).toISOString()}`);
      lines.push(`- **Directory**: ${e.workingDirectory}`);
      lines.push(`- **Status**: ${e.status}`);
      lines.push(`- **Duration**: ${e.duration}ms`);

      if (e.tags.length > 0) {
        lines.push(`- **Tags**: ${e.tags.join(', ')}`);
      }
      if (e.bookmarked) {
        lines.push('- **Bookmarked**: Yes');
      }
      if (e.rating) {
        lines.push(`- **Rating**: ${'⭐'.repeat(e.rating)}`);
      }
      if (options.includeNotes && e.notes) {
        lines.push('');
        lines.push('**Notes**:');
        lines.push(e.notes);
      }
      if (options.includeOutput && e.output) {
        lines.push('');
        lines.push('**Output**:');
        lines.push('```');
        lines.push(e.output);
        lines.push('```');
      }
      if (e.error) {
        lines.push('');
        lines.push('**Error**:');
        lines.push('```');
        lines.push(e.error);
        lines.push('```');
      }

      lines.push('');
    });

    return lines.join('\n');
  }

  clear(): void {
    this.entries = [];
    this.nextId = 1;
    this.saveDatabase();
  }

  private loadDatabase(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.entries = data.entries || [];
        this.nextId = data.nextId || 1;
      }
    } catch (error) {
      console.error('Failed to load history database:', error);
    }
  }

  private saveDatabase(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        entries: this.entries,
        nextId: this.nextId,
      };

      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save history database:', error);
    }
  }
}

let engineInstance: CommandHistoryEngine | null = null;

export function getHistoryEngine(): CommandHistoryEngine {
  if (!engineInstance) {
    engineInstance = new CommandHistoryEngine();
  }
  return engineInstance;
}

export function resetHistoryEngine(): void {
  engineInstance = null;
}
