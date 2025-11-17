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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  CommandHistoryEngine,
  getHistoryEngine,
  resetHistoryEngine,
} from './history-engine.js';

describe('CommandHistoryEngine', () => {
  let tempDir: string;
  let engine: CommandHistoryEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-test-'));
    const dbPath = path.join(tempDir, 'history.json');
    engine = new CommandHistoryEngine(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('addEntry', () => {
    it('should add a new entry', () => {
      const entry = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });

      expect(entry.id).toBeTruthy();
      expect(entry.command).toBe('npm');
      expect(entry.args).toBe('test');
    });

    it('should auto-generate ID', () => {
      const entry1 = engine.addEntry({
        timestamp: Date.now(),
        command: 'git',
        args: 'status',
        workingDirectory: '/test',
        status: 'success',
        duration: 500,
        tags: [],
        bookmarked: false,
      });

      const entry2 = engine.addEntry({
        timestamp: Date.now(),
        command: 'ls',
        args: '',
        workingDirectory: '/test',
        status: 'success',
        duration: 100,
        tags: [],
        bookmarked: false,
      });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe('getEntry', () => {
    it('should retrieve entry by ID', () => {
      const added = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });

      const retrieved = engine.getEntry(added.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.command).toBe('npm');
    });

    it('should return undefined for non-existent ID', () => {
      const entry = engine.getEntry('non-existent');
      expect(entry).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/project',
        status: 'success',
        duration: 1000,
        tags: ['testing'],
        bookmarked: true,
      });

      engine.addEntry({
        timestamp: Date.now(),
        command: 'git',
        args: 'commit',
        workingDirectory: '/project',
        status: 'success',
        duration: 500,
        tags: ['git'],
        bookmarked: false,
      });

      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'install',
        workingDirectory: '/project',
        status: 'error',
        duration: 2000,
        tags: [],
        bookmarked: false,
      });
    });

    it('should search by text', () => {
      const result = engine.search({ text: 'npm' });
      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.command === 'npm')).toBe(true);
    });

    it('should filter by tags', () => {
      const result = engine.search({ tags: ['testing'] });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].command).toBe('npm');
    });

    it('should filter by bookmarked', () => {
      const result = engine.search({ bookmarked: true });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].bookmarked).toBe(true);
    });

    it('should filter by status', () => {
      const result = engine.search({ status: 'error' });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].status).toBe('error');
    });

    it('should support pagination', () => {
      const result = engine.search({ limit: 2 });
      expect(result.entries.length).toBe(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should support offset', () => {
      const result = engine.search({ offset: 1, limit: 2 });
      expect(result.entries.length).toBe(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('tags', () => {
    let entryId: string;

    beforeEach(() => {
      const entry = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });
      entryId = entry.id;
    });

    it('should add tag', () => {
      engine.addTag(entryId, 'important');
      const entry = engine.getEntry(entryId);
      expect(entry?.tags).toContain('important');
    });

    it('should not duplicate tags', () => {
      engine.addTag(entryId, 'test');
      engine.addTag(entryId, 'test');
      const entry = engine.getEntry(entryId);
      expect(entry?.tags.filter((t) => t === 'test').length).toBe(1);
    });

    it('should remove tag', () => {
      engine.addTag(entryId, 'temp');
      engine.removeTag(entryId, 'temp');
      const entry = engine.getEntry(entryId);
      expect(entry?.tags).not.toContain('temp');
    });

    it('should throw error for non-existent entry', () => {
      expect(() => engine.addTag('non-existent', 'tag')).toThrow(
        'Entry not found',
      );
    });
  });

  describe('bookmarks', () => {
    let entryId: string;

    beforeEach(() => {
      const entry = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });
      entryId = entry.id;
    });

    it('should bookmark entry', () => {
      engine.bookmark(entryId);
      const entry = engine.getEntry(entryId);
      expect(entry?.bookmarked).toBe(true);
    });

    it('should unbookmark entry', () => {
      engine.bookmark(entryId);
      engine.unbookmark(entryId);
      const entry = engine.getEntry(entryId);
      expect(entry?.bookmarked).toBe(false);
    });
  });

  describe('ratings', () => {
    let entryId: string;

    beforeEach(() => {
      const entry = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });
      entryId = entry.id;
    });

    it('should rate entry', () => {
      engine.rate(entryId, 5);
      const entry = engine.getEntry(entryId);
      expect(entry?.rating).toBe(5);
    });

    it('should reject invalid ratings', () => {
      expect(() => engine.rate(entryId, 0)).toThrow(
        'Rating must be between 1 and 5',
      );
      expect(() => engine.rate(entryId, 6)).toThrow(
        'Rating must be between 1 and 5',
      );
    });
  });

  describe('notes', () => {
    let entryId: string;

    beforeEach(() => {
      const entry = engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });
      entryId = entry.id;
    });

    it('should add note', () => {
      engine.addNote(entryId, 'This command worked well');
      const entry = engine.getEntry(entryId);
      expect(entry?.notes).toBe('This command worked well');
    });

    it('should update existing note', () => {
      engine.addNote(entryId, 'First note');
      engine.addNote(entryId, 'Updated note');
      const entry = engine.getEntry(entryId);
      expect(entry?.notes).toBe('Updated note');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: ['test'],
        bookmarked: true,
      });

      engine.addEntry({
        timestamp: Date.now(),
        command: 'git',
        args: 'commit',
        workingDirectory: '/test',
        status: 'error',
        duration: 500,
        tags: ['git'],
        bookmarked: false,
      });
    });

    it('should calculate correct statistics', () => {
      const stats = engine.getStats();
      expect(stats.totalCommands).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.bookmarkedCount).toBe(1);
      expect(stats.taggedCount).toBe(2);
    });

    it('should calculate success rate', () => {
      const stats = engine.getStats();
      expect(stats.successRate).toBe(50);
    });

    it('should list top commands', () => {
      const stats = engine.getStats();
      expect(stats.topCommands.length).toBeGreaterThan(0);
      expect(stats.topCommands[0].count).toBeGreaterThan(0);
    });

    it('should list top tags', () => {
      const stats = engine.getStats();
      expect(stats.topTags.length).toBe(2);
    });
  });

  describe('detectPatterns', () => {
    it('should detect command patterns', () => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });

      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1200,
        tags: [],
        bookmarked: false,
      });

      const patterns = engine.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].pattern).toBe('npm');
      expect(patterns[0].frequency).toBe(2);
    });

    it('should calculate average duration', () => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'git',
        args: 'status',
        workingDirectory: '/test',
        status: 'success',
        duration: 500,
        tags: [],
        bookmarked: false,
      });

      engine.addEntry({
        timestamp: Date.now(),
        command: 'git',
        args: 'status',
        workingDirectory: '/test',
        status: 'success',
        duration: 600,
        tags: [],
        bookmarked: false,
      });

      const patterns = engine.detectPatterns();
      const gitPattern = patterns.find((p) => p.pattern === 'git');
      expect(gitPattern?.avgDuration).toBe(550);
    });
  });

  describe('export', () => {
    beforeEach(() => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: ['test'],
        bookmarked: true,
        output: 'Test passed',
        notes: 'Good test',
      });
    });

    it('should export to JSON', () => {
      const data = engine.export({ format: 'json' });
      expect(data).toContain('"command"');
      expect(data).toContain('"npm"');
    });

    it('should export to CSV', () => {
      const data = engine.export({ format: 'csv' });
      expect(data).toContain('ID,Timestamp');
      expect(data).toContain('npm');
    });

    it('should export to Markdown', () => {
      const data = engine.export({ format: 'markdown' });
      expect(data).toContain('# Command History');
      expect(data).toContain('npm');
    });

    it('should include output when requested', () => {
      const data = engine.export({ format: 'json', includeOutput: true });
      expect(data).toContain('Test passed');
    });

    it('should include notes when requested', () => {
      const data = engine.export({ format: 'json', includeNotes: true });
      expect(data).toContain('Good test');
    });
  });

  describe('persistence', () => {
    it('should persist entries to file', () => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });

      const dbPath = path.join(tempDir, 'history.json');
      expect(fs.existsSync(dbPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(data.entries.length).toBe(1);
    });

    it('should load entries from file', () => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: ['test'],
        bookmarked: false,
      });

      const dbPath = path.join(tempDir, 'history.json');
      const newEngine = new CommandHistoryEngine(dbPath);
      const result = newEngine.search({ text: 'npm' });

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].command).toBe('npm');
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      engine.addEntry({
        timestamp: Date.now(),
        command: 'npm',
        args: 'test',
        workingDirectory: '/test',
        status: 'success',
        duration: 1000,
        tags: [],
        bookmarked: false,
      });

      engine.clear();
      const result = engine.search({});
      expect(result.entries.length).toBe(0);
    });
  });
});

describe('getHistoryEngine', () => {
  afterEach(() => {
    resetHistoryEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getHistoryEngine();
    const engine2 = getHistoryEngine();
    expect(engine1).toBe(engine2);
  });

  it('should create new instance after reset', () => {
    const engine1 = getHistoryEngine();
    resetHistoryEngine();
    const engine2 = getHistoryEngine();
    expect(engine1).not.toBe(engine2);
  });
});
