/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import v8 from 'node:v8';
import fs from 'node:fs';
import { captureHeapSnapshot } from './heap-snapshot.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('node:v8');
vi.mock('node:fs');
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    error: vi.fn(),
  },
}));

describe('heap-snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should capture a heap snapshot to a secure directory', () => {
    vi.mocked(fs.mkdtempSync).mockReturnValue('/tmp/gemini-heap-abc123');

    const filePath = captureHeapSnapshot();

    expect(filePath).toContain('gemini-heap-abc123');
    expect(filePath).toContain('.heapsnapshot');
    expect(v8.writeHeapSnapshot).toHaveBeenCalledWith(filePath);
  });

  it('should return null and log an error if capture fails', () => {
    vi.mocked(fs.mkdtempSync).mockImplementation(() => {
      throw new Error('Disk full');
    });

    const result = captureHeapSnapshot();

    expect(result).toBeNull();
    expect(debugLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to capture heap snapshot'),
      expect.any(Error),
    );
  });
});
