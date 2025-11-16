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
  ExampleHistory,
  getExampleHistory,
  resetExampleHistory,
} from './history.js';

describe('ExampleHistory', () => {
  let history: ExampleHistory;
  let tempDir: string;
  let tempFile: string;

  beforeEach(() => {
    // Create temp file for each test to avoid auto-loading existing history
    tempDir = path.join(os.tmpdir(), `gemini-cli-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    tempFile = path.join(tempDir, 'test-history.json');

    // Create fresh history instance with temp file and auto-save disabled
    history = new ExampleHistory(tempFile, false);
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  });

  describe('record', () => {
    it('should record example executions', () => {
      history.record({
        exampleId: 'test-example',
        timestamp: Date.now(),
        action: 'run',
      });

      const entries = history.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].exampleId).toBe('test-example');
      expect(entries[0].action).toBe('run');
    });

    it('should record with context variables', () => {
      history.record({
        exampleId: 'test-example',
        timestamp: Date.now(),
        action: 'run',
        contextVars: { file: 'test.ts' },
      });

      const entries = history.getAll();
      expect(entries[0].contextVars).toEqual({ file: 'test.ts' });
    });

    it('should maintain most recent entries first', () => {
      history.record({
        exampleId: 'first',
        timestamp: 1000,
        action: 'run',
      });
      history.record({
        exampleId: 'second',
        timestamp: 2000,
        action: 'run',
      });

      const entries = history.getAll();
      expect(entries[0].exampleId).toBe('second');
      expect(entries[1].exampleId).toBe('first');
    });
  });

  describe('getForExample', () => {
    it('should return history for specific example', () => {
      history.record({
        exampleId: 'example-1',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-2',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-1',
        timestamp: Date.now(),
        action: 'preview',
      });

      const example1History = history.getForExample('example-1');
      expect(example1History).toHaveLength(2);
      expect(example1History.every((e) => e.exampleId === 'example-1')).toBe(
        true,
      );
    });
  });

  describe('getRecent', () => {
    it('should return recent entries with default limit', () => {
      for (let i = 0; i < 20; i++) {
        history.record({
          exampleId: `example-${i}`,
          timestamp: Date.now() + i,
          action: 'run',
        });
      }

      const recent = history.getRecent();
      expect(recent).toHaveLength(10); // default limit
    });

    it('should respect custom limit', () => {
      for (let i = 0; i < 20; i++) {
        history.record({
          exampleId: `example-${i}`,
          timestamp: Date.now() + i,
          action: 'run',
        });
      }

      const recent = history.getRecent(5);
      expect(recent).toHaveLength(5);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      history.record({
        exampleId: 'example-1',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-1',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-2',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-3',
        timestamp: Date.now(),
        action: 'preview',
      });
      history.record({
        exampleId: 'example-4',
        timestamp: Date.now(),
        action: 'save',
        notes: 'my-command',
      });
    });

    it('should count total runs', () => {
      const stats = history.getStats();
      expect(stats.totalRuns).toBe(3);
    });

    it('should count total previews', () => {
      const stats = history.getStats();
      expect(stats.totalPreviews).toBe(1);
    });

    it('should identify popular examples', () => {
      const stats = history.getStats();
      expect(stats.popularExamples).toHaveLength(2);
      expect(stats.popularExamples[0].exampleId).toBe('example-1');
      expect(stats.popularExamples[0].runCount).toBe(2);
    });

    it('should track saved commands', () => {
      const stats = history.getStats();
      expect(stats.savedCommands).toHaveLength(1);
      expect(stats.savedCommands[0].exampleId).toBe('example-4');
      expect(stats.savedCommands[0].commandName).toBe('my-command');
    });
  });

  describe('clear', () => {
    it('should clear all history', () => {
      history.record({
        exampleId: 'test',
        timestamp: Date.now(),
        action: 'run',
      });

      history.clear();
      expect(history.getAll()).toHaveLength(0);
    });
  });

  describe('clearForExample', () => {
    it('should clear history for specific example', () => {
      history.record({
        exampleId: 'example-1',
        timestamp: Date.now(),
        action: 'run',
      });
      history.record({
        exampleId: 'example-2',
        timestamp: Date.now(),
        action: 'run',
      });

      history.clearForExample('example-1');

      const all = history.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].exampleId).toBe('example-2');
    });
  });

  describe('JSON serialization', () => {
    it('should export to JSON', () => {
      history.record({
        exampleId: 'test',
        timestamp: 12345,
        action: 'run',
      });

      const json = history.toJSON();
      expect(json).toContain('test');
      expect(json).toContain('12345');
    });

    it('should import from JSON', () => {
      const json = JSON.stringify([
        {
          exampleId: 'test',
          timestamp: 12345,
          action: 'run',
        },
      ]);

      history.fromJSON(json);
      expect(history.getAll()).toHaveLength(1);
      expect(history.getAll()[0].exampleId).toBe('test');
    });

    it('should handle invalid JSON gracefully', () => {
      history.fromJSON('invalid json');
      expect(history.getAll()).toHaveLength(0);
    });
  });

  describe('rate (Phase 4)', () => {
    it('should record a rating for an example', () => {
      history.rate('example-1', 5, 'Excellent example!');

      const entries = history.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].exampleId).toBe('example-1');
      expect(entries[0].rating).toBe(5);
      expect(entries[0].notes).toBe('Excellent example!');
      expect(entries[0].action).toBe('run');
    });

    it('should validate rating is between 1 and 5', () => {
      expect(() => history.rate('example-1', 0)).toThrow(
        'Rating must be between 1 and 5',
      );
      expect(() => history.rate('example-1', 6)).toThrow(
        'Rating must be between 1 and 5',
      );
      expect(() => history.rate('example-1', -1)).toThrow(
        'Rating must be between 1 and 5',
      );
    });

    it('should accept ratings without notes', () => {
      history.rate('example-1', 4);

      const entries = history.getAll();
      expect(entries[0].rating).toBe(4);
      expect(entries[0].notes).toBeUndefined();
    });

    it('should allow multiple ratings for same example', () => {
      history.rate('example-1', 5);
      history.rate('example-1', 3);
      history.rate('example-1', 4);

      const entries = history.getForExample('example-1');
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.rating)).toEqual([4, 3, 5]);
    });
  });

  describe('getStats with ratings (Phase 4)', () => {
    it('should calculate top-rated examples', () => {
      // Example 1: two 5-star ratings (avg: 5.0)
      history.rate('example-1', 5);
      history.rate('example-1', 5);

      // Example 2: one 4-star rating (avg: 4.0)
      history.rate('example-2', 4);

      // Example 3: 3-star and 5-star (avg: 4.0)
      history.rate('example-3', 3);
      history.rate('example-3', 5);

      const stats = history.getStats();

      expect(stats.topRated).toHaveLength(3);
      expect(stats.topRated[0].exampleId).toBe('example-1');
      expect(stats.topRated[0].averageRating).toBe(5.0);
      expect(stats.topRated[0].ratingCount).toBe(2);

      // Example 2 and 3 both have 4.0 avg, order may vary
      const secondAndThird = stats.topRated.slice(1, 3);
      expect(secondAndThird.some((s) => s.exampleId === 'example-2')).toBe(
        true,
      );
      expect(secondAndThird.some((s) => s.exampleId === 'example-3')).toBe(
        true,
      );
    });

    it('should handle examples without ratings', () => {
      history.record({
        exampleId: 'unrated',
        timestamp: Date.now(),
        action: 'run',
      });
      history.rate('example-1', 5);

      const stats = history.getStats();

      expect(stats.topRated).toHaveLength(1);
      expect(stats.topRated[0].exampleId).toBe('example-1');
    });

    it('should limit top-rated to 10 examples', () => {
      for (let i = 1; i <= 15; i++) {
        history.rate(`example-${i}`, 5);
      }

      const stats = history.getStats();
      expect(stats.topRated).toHaveLength(10);
    });
  });

  describe('save and load (Phase 4)', () => {
    it('should save history to disk', () => {
      const testHistory = new ExampleHistory(tempFile, false);
      testHistory.record({
        exampleId: 'test-example',
        timestamp: 12345,
        action: 'run',
      });

      testHistory.save();

      expect(fs.existsSync(tempFile)).toBe(true);
      const content = fs.readFileSync(tempFile, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].exampleId).toBe('test-example');
    });

    it('should load history from disk', () => {
      // Write test data to file
      const testData = [
        {
          exampleId: 'loaded-example',
          timestamp: 54321,
          action: 'preview',
        },
      ];
      fs.writeFileSync(tempFile, JSON.stringify(testData, null, 2));

      const testHistory = new ExampleHistory(tempFile, false);

      const entries = testHistory.getAll();
      expect(entries).toHaveLength(1);
      expect(entries[0].exampleId).toBe('loaded-example');
      expect(entries[0].timestamp).toBe(54321);
    });

    it('should auto-save when enabled', () => {
      const testHistory = new ExampleHistory(tempFile, true);

      testHistory.record({
        exampleId: 'auto-saved',
        timestamp: Date.now(),
        action: 'run',
      });

      // Should auto-save immediately
      expect(fs.existsSync(tempFile)).toBe(true);
      const content = fs.readFileSync(tempFile, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed[0].exampleId).toBe('auto-saved');
    });

    it('should not auto-save when disabled', () => {
      const testHistory = new ExampleHistory(tempFile, false);

      testHistory.record({
        exampleId: 'not-auto-saved',
        timestamp: Date.now(),
        action: 'run',
      });

      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it('should create directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'nested', 'path');
      const nestedFile = path.join(nestedDir, 'history.json');

      const testHistory = new ExampleHistory(nestedFile, false);
      testHistory.record({
        exampleId: 'test',
        timestamp: Date.now(),
        action: 'run',
      });
      testHistory.save();

      expect(fs.existsSync(nestedFile)).toBe(true);
    });

    it('should handle save errors gracefully', () => {
      const invalidPath = '/invalid/path/that/does/not/exist/history.json';
      const testHistory = new ExampleHistory(invalidPath, false);

      // Should not throw, just log error
      expect(() => testHistory.save()).not.toThrow();
    });

    it('should handle load errors gracefully', () => {
      const testHistory = new ExampleHistory(tempFile, false);
      // File doesn't exist yet, should not throw
      testHistory.load();
      expect(testHistory.getAll()).toHaveLength(0);
    });

    it('should auto-load on construction', () => {
      // Create a file with test data
      const testData = [
        {
          exampleId: 'auto-loaded',
          timestamp: 99999,
          action: 'run',
        },
      ];
      fs.writeFileSync(tempFile, JSON.stringify(testData));

      // Create new instance - should auto-load
      const testHistory = new ExampleHistory(tempFile, false);

      expect(testHistory.getAll()).toHaveLength(1);
      expect(testHistory.getAll()[0].exampleId).toBe('auto-loaded');
    });

    it('should round-trip save and load with ratings', () => {
      const testHistory1 = new ExampleHistory(tempFile, false);
      testHistory1.rate('example-1', 5, 'Great!');
      testHistory1.rate('example-2', 3, 'Okay');
      testHistory1.save();

      const testHistory2 = new ExampleHistory(tempFile, false);
      const entries = testHistory2.getAll();

      expect(entries).toHaveLength(2);
      expect(entries[0].rating).toBe(3);
      expect(entries[0].notes).toBe('Okay');
      expect(entries[1].rating).toBe(5);
      expect(entries[1].notes).toBe('Great!');
    });
  });
});

describe('getExampleHistory', () => {
  beforeEach(() => {
    resetExampleHistory();
  });

  it('should return singleton instance', () => {
    const history1 = getExampleHistory();
    const history2 = getExampleHistory();
    expect(history1).toBe(history2);
  });

  it('should persist data across calls', () => {
    const history1 = getExampleHistory();
    // Clear any existing history first
    history1.clear();

    history1.record({
      exampleId: 'test',
      timestamp: Date.now(),
      action: 'run',
    });

    const history2 = getExampleHistory();
    expect(history2.getAll()).toHaveLength(1);
  });
});
