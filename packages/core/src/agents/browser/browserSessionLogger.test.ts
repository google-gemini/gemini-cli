/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrowserSessionLogger } from './browserSessionLogger.js';

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('BrowserSessionLogger', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-log-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create the log file on first write', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-1');
    logger.logEvent('test', { key: 'value' });

    const filePath = logger.getFilePath();
    expect(fs.existsSync(filePath)).toBe(true);
    expect(filePath).toContain('browser-session-sess-1.jsonl');
  });

  it('should write valid JSONL entries', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-2');
    logger.logEvent('connection_start', { mode: 'isolated' });
    logger.logEvent('tool_call', { name: 'click', uid: '5_1' });

    const content = fs.readFileSync(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry1['type']).toBe('connection_start');
    expect((entry1['data'] as Record<string, unknown>)['mode']).toBe(
      'isolated',
    );
    expect(entry1['timestamp']).toBeDefined();

    const entry2 = JSON.parse(lines[1]) as Record<string, unknown>;
    expect(entry2['type']).toBe('tool_call');
    expect((entry2['data'] as Record<string, unknown>)['name']).toBe('click');
  });

  it('should include ISO-8601 timestamps', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-3');
    logger.logEvent('test', {});

    const content = fs.readFileSync(logger.getFilePath(), 'utf-8');
    const entry = JSON.parse(content.trim()) as Record<string, unknown>;
    const ts = String(entry['timestamp']);
    // ISO-8601 format check
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('should stop writing after close()', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-4');
    logger.logEvent('before', {});
    logger.close();
    logger.logEvent('after', {});

    const content = fs.readFileSync(logger.getFilePath(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])['type']).toBe('before');
  });

  it('should create nested directories if needed', () => {
    const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
    const logger = new BrowserSessionLogger(nestedDir, 'sess-5');
    logger.logEvent('test', {});

    expect(fs.existsSync(logger.getFilePath())).toBe(true);
  });

  it('should not throw on write errors', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-6');

    // Make the file read-only to trigger a write error
    logger.logEvent('first', {});
    fs.chmodSync(logger.getFilePath(), 0o444);

    expect(() => {
      logger.logEvent('second', {});
    }).not.toThrow();

    // Restore permissions for cleanup
    fs.chmodSync(logger.getFilePath(), 0o644);
  });
});
