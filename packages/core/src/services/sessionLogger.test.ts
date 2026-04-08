/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionLogger } from './sessionLogger.js';
import type { SessionLogEntry } from './sessionLogTypes.js';

function makeEntry(overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    sessionId: 'test-session-123',
    prompt: 'Test prompt',
    summary: 'Did something useful',
    filesModified: ['src/index.ts'],
    durationMs: 1500,
    ...overrides,
  };
}

describe('SessionLogger', () => {
  let tmpDir: string;
  let logger: SessionLogger;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-logger-test-'));
    logger = SessionLogger.create(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes entries to a dated JSONL file', async () => {
    logger.logEntry(makeEntry());
    await logger.flush();

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);

    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.sessionId).toBe('test-session-123');
    expect(parsed.prompt).toBe('Test prompt');
  });

  it('truncates prompts exceeding 500 characters', async () => {
    const longPrompt = 'x'.repeat(1000);
    logger.logEntry(makeEntry({ prompt: longPrompt }));
    await logger.flush();

    const files = await fs.readdir(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.prompt).toHaveLength(500);
  });

  it('buffers entries and flushes automatically at threshold', async () => {
    // Default threshold is 5
    for (let i = 0; i < 5; i++) {
      logger.logEntry(makeEntry({ sessionId: `session-${i}` }));
    }

    // Give the async flush time to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);

    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(5);
  });

  it('groups entries by date into separate files', async () => {
    logger.logEntry(makeEntry({ timestamp: '2026-01-15T10:00:00Z' }));
    logger.logEntry(makeEntry({ timestamp: '2026-01-16T10:00:00Z' }));
    await logger.flush();

    const files = (await fs.readdir(tmpDir)).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toBe('2026-01-15.jsonl');
    expect(files[1]).toBe('2026-01-16.jsonl');
  });

  it('appends to existing log files', async () => {
    logger.logEntry(makeEntry({ summary: 'first' }));
    await logger.flush();

    logger.logEntry(makeEntry({ summary: 'second' }));
    await logger.flush();

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);

    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).summary).toBe('first');
    expect(JSON.parse(lines[1]).summary).toBe('second');
  });

  it('flushes remaining entries on shutdown', async () => {
    logger.logEntry(makeEntry());
    // Don't call flush — shutdown should handle it
    await logger.shutdown();

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);
  });

  describe('rotateOldLogs', () => {
    it('deletes log files older than retention period', async () => {
      // Create old and new log files
      await fs.writeFile(path.join(tmpDir, '2025-01-01.jsonl'), '{}');
      await fs.writeFile(path.join(tmpDir, '2026-12-31.jsonl'), '{}');

      const deleted = await logger.rotateOldLogs();

      expect(deleted).toBe(1);
      const files = await fs.readdir(tmpDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('2026-12-31.jsonl');
    });

    it('ignores non-log files', async () => {
      await fs.writeFile(path.join(tmpDir, 'readme.md'), 'hello');
      await fs.writeFile(path.join(tmpDir, '2025-01-01.jsonl'), '{}');

      await logger.rotateOldLogs();

      const files = await fs.readdir(tmpDir);
      expect(files).toContain('readme.md');
    });
  });

  describe('readRecentEntries', () => {
    it('reads entries from recent log files', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const entry = makeEntry();
      await fs.writeFile(
        path.join(tmpDir, `${today}.jsonl`),
        JSON.stringify(entry) + '\n',
      );

      const entries = await logger.readRecentEntries(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].sessionId).toBe('test-session-123');
    });

    it('skips malformed lines', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const entry = makeEntry();
      const content =
        'not valid json\n' + JSON.stringify(entry) + '\n' + '{}\n';
      await fs.writeFile(path.join(tmpDir, `${today}.jsonl`), content);

      const entries = await logger.readRecentEntries(1);
      expect(entries).toHaveLength(1);
    });

    it('returns empty array when log dir does not exist', async () => {
      const nonExistent = SessionLogger.create('/tmp/does-not-exist-xyz');
      const entries = await nonExistent.readRecentEntries(7);
      expect(entries).toHaveLength(0);
    });
  });
});
