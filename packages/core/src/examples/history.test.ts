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

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExampleHistory,
  getExampleHistory,
  resetExampleHistory,
} from './history.js';

describe('ExampleHistory', () => {
  let history: ExampleHistory;

  beforeEach(() => {
    history = new ExampleHistory();
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
    history1.record({
      exampleId: 'test',
      timestamp: Date.now(),
      action: 'run',
    });

    const history2 = getExampleHistory();
    expect(history2.getAll()).toHaveLength(1);
  });
});
