/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BrowserSessionLogger,
  redactSensitiveFields,
} from './browserSessionLogger.js';

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

  it('should create log files with restrictive permissions', () => {
    const logger = new BrowserSessionLogger(tmpDir, 'sess-perms');
    logger.logEvent('test', { key: 'value' });

    const stats = fs.statSync(logger.getFilePath());
    // 0o600 = owner read+write only (octal 33188 on most systems)
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('redactSensitiveFields', () => {
  it('should redact known sensitive keys', () => {
    const data = {
      value: 'my-password',
      text: 'secret-text',
      password: 'hunter2',
      token: 'abc123',
    };
    const result = redactSensitiveFields(data);
    expect(result['value']).toBe('[REDACTED]');
    expect(result['text']).toBe('[REDACTED]');
    expect(result['password']).toBe('[REDACTED]');
    expect(result['token']).toBe('[REDACTED]');
  });

  it('should preserve non-sensitive keys', () => {
    const data = { uid: '87_4', name: 'click', url: 'https://example.com' };
    const result = redactSensitiveFields(data);
    expect(result).toEqual(data);
  });

  it('should redact sensitive keys inside nested args', () => {
    const data = {
      name: 'fill',
      args: { uid: '5_1', value: 'super-secret' },
    };
    const result = redactSensitiveFields(data);
    expect(result['name']).toBe('fill');
    const args = result['args'] as Record<string, unknown>;
    expect(args['uid']).toBe('5_1');
    expect(args['value']).toBe('[REDACTED]');
  });

  it('should be case-insensitive for key matching', () => {
    const data = { Password: 'secret', TOKEN: 'abc' };
    const result = redactSensitiveFields(data);
    expect(result['Password']).toBe('[REDACTED]');
    expect(result['TOKEN']).toBe('[REDACTED]');
  });

  it('should not redact non-string values for sensitive keys', () => {
    const data = { value: 42, text: true };
    const result = redactSensitiveFields(data);
    expect(result['value']).toBe(42);
    expect(result['text']).toBe(true);
  });

  it('should not mutate the original object', () => {
    const data = { value: 'secret', uid: '1_2' };
    redactSensitiveFields(data);
    expect(data['value']).toBe('secret');
  });
});
