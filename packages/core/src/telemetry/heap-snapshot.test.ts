/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import fs from 'node:fs';
import os from 'node:os';
import {
  captureHeapSnapshot,
  formatSnapshotSummary,
  type HeapSnapshotResult,
} from './heap-snapshot.js';

// Mock dependencies
vi.mock('node:v8', () => ({
  default: {
    writeHeapSnapshot: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  default: {
    tmpdir: vi.fn(),
  },
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('captureHeapSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 5242880 } as fs.Stats);
    vi.mocked(v8.writeHeapSnapshot).mockImplementation(
      (filename?: string) => filename || '/tmp/fallback.heapsnapshot',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should capture a heap snapshot to the default tmp directory', () => {
    const result = captureHeapSnapshot();

    expect(result).not.toBeNull();
    // Use platform-agnostic path checks
    expect(result!.filePath).toContain('tmp');
    expect(result!.filePath).toContain('gemini-heap-');
    expect(result!.filePath).toMatch(/\.heapsnapshot$/);
    expect(result!.heapUsedBytes).toBeGreaterThan(0);
    expect(result!.heapTotalBytes).toBeGreaterThan(0);
    expect(result!.rssBytes).toBeGreaterThan(0);
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.fileSizeBytes).toBe(5242880);
    expect(v8.writeHeapSnapshot).toHaveBeenCalledOnce();
  });

  it('should use a custom output directory', () => {
    const customDir = '/custom/dir';
    const result = captureHeapSnapshot({ outputDir: customDir });

    expect(result).not.toBeNull();
    expect(result!.filePath).toContain('custom');
    expect(result!.filePath).toContain('dir');
    expect(v8.writeHeapSnapshot).toHaveBeenCalledOnce();
  });

  it('should include the tag in the filename', () => {
    const result = captureHeapSnapshot({ tag: 'before-gc' });

    expect(result).not.toBeNull();
    expect(result!.filePath).toContain('-before-gc.heapsnapshot');
  });

  it('should sanitize special characters in tags', () => {
    const result = captureHeapSnapshot({ tag: 'my tag/with:chars' });

    expect(result).not.toBeNull();
    expect(result!.filePath).toContain('-my_tag_with_chars.heapsnapshot');
  });

  it('should create the output directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    captureHeapSnapshot({ outputDir: '/new/dir' });

    expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
  });

  it('should return null if directory creation fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = captureHeapSnapshot({ outputDir: '/no-access' });

    expect(result).toBeNull();
  });

  it('should return null if v8.writeHeapSnapshot throws', () => {
    vi.mocked(v8.writeHeapSnapshot).mockImplementation(() => {
      throw new Error('Snapshot failed');
    });

    const result = captureHeapSnapshot();

    expect(result).toBeNull();
  });

  it('should handle statSync failure gracefully', () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const result = captureHeapSnapshot();

    expect(result).not.toBeNull();
    expect(result!.fileSizeBytes).toBe(0);
  });

  it('should record a valid timestamp', () => {
    const before = Date.now();
    const result = captureHeapSnapshot();
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBeGreaterThanOrEqual(before);
    expect(result!.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('formatSnapshotSummary', () => {
  it('should produce a human-readable summary', () => {
    const result: HeapSnapshotResult = {
      filePath: '/tmp/gemini-heap-123.heapsnapshot',
      timestamp: 1700000000000,
      heapUsedBytes: 50 * 1024 * 1024, // 50 MB
      heapTotalBytes: 100 * 1024 * 1024, // 100 MB
      rssBytes: 200 * 1024 * 1024, // 200 MB
      durationMs: 150,
      fileSizeBytes: 10 * 1024 * 1024, // 10 MB
    };

    const summary = formatSnapshotSummary(result);

    expect(summary).toContain('/tmp/gemini-heap-123.heapsnapshot');
    expect(summary).toContain('50.0 MB');
    expect(summary).toContain('100.0 MB');
    expect(summary).toContain('200.0 MB');
    expect(summary).toContain('10.0 MB');
    expect(summary).toContain('150 ms');
    expect(summary).toContain('Chrome DevTools');
  });
});
