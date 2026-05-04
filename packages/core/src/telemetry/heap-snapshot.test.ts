/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import v8 from 'node:v8';
import fs from 'node:fs';
import { captureHeapSnapshot } from './heap-snapshot.js';

vi.mock('node:v8');
vi.mock('node:fs');

describe('heap-snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should capture a heap snapshot to the correct directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const filePath = captureHeapSnapshot();

    expect(filePath).toContain('gemini-snapshots');
    expect(filePath).toContain('.heapsnapshot');
    expect(v8.writeHeapSnapshot).toHaveBeenCalledWith(filePath);
  });

  it('should create the snapshots directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    captureHeapSnapshot();

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('gemini-snapshots'),
      { recursive: true },
    );
  });
});
