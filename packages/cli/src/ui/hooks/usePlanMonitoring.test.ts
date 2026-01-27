/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlanMonitoring } from './usePlanMonitoring.js';
import { renderHook } from '../../test-utils/render.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { makeFakeConfig, type Config } from '@google/gemini-cli-core';
import { waitFor } from '../../test-utils/async.js';
import { act } from 'react';

const { mockFsPromises } = vi.hoisted(() => ({
  mockFsPromises: {
    readdir: vi.fn(),
    lstat: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  lstatSync: vi.fn(),
  statSync: vi.fn(),
  realpathSync: vi.fn(),
  promises: mockFsPromises,
  default: {
    existsSync: vi.fn(),
    lstatSync: vi.fn(),
    statSync: vi.fn(),
    realpathSync: vi.fn(),
    promises: mockFsPromises,
  },
}));

vi.mock('node:fs/promises', () => mockFsPromises);

describe('usePlanMonitoring', () => {
  let mockConfig: Config;
  const plansDir = path.join(os.tmpdir(), 'test-plans');

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = p.toString();
      if (pathStr === plansDir || pathStr === os.tmpdir()) return true;
      return false;
    });
    vi.mocked(fs.lstatSync).mockImplementation((p) => {
      const pathStr = p.toString();
      if (pathStr === plansDir || pathStr === os.tmpdir()) {
        return { isDirectory: () => true } as fs.Stats;
      }
      throw new Error('ENOENT');
    });
    vi.mocked(fs.statSync).mockImplementation((p) => {
      const pathStr = p.toString();
      if (pathStr === plansDir || pathStr === os.tmpdir()) {
        return { isDirectory: () => true } as fs.Stats;
      }
      throw new Error('ENOENT');
    });
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

    mockConfig = makeFakeConfig({
      targetDir: os.tmpdir(),
    });
    vi.spyOn(mockConfig.storage, 'getProjectTempPlansDir').mockReturnValue(
      plansDir,
    );
    mockFsPromises.readdir.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initially has null todos and planFileName', async () => {
    mockFsPromises.readdir.mockResolvedValue([]);
    const { result } = renderHook(() => usePlanMonitoring(mockConfig));

    expect(result.current.planTodos).toBeNull();
    expect(result.current.planFileName).toBeNull();
  });

  it('reads the most recently modified markdown file', async () => {
    const file1 = 'old.md';
    const file2 = 'new.md';

    mockFsPromises.readdir.mockResolvedValue([file1, file2]);
    mockFsPromises.lstat.mockImplementation(async (p) => {
      const pathStr = p.toString();
      if (pathStr.endsWith(file1))
        return { isFile: () => true, mtimeMs: 100 } as fs.Stats;
      if (pathStr.endsWith(file2))
        return { isFile: () => true, mtimeMs: 200 } as fs.Stats;
      return { isFile: () => false } as fs.Stats;
    });
    mockFsPromises.readFile.mockResolvedValue('- [ ] Task from new.md');

    const { result } = renderHook(() => usePlanMonitoring(mockConfig));

    await waitFor(() => {
      expect(result.current.planFileName).toBe(file2);
      expect(result.current.planTodos).toEqual([
        { description: 'Task from new.md', status: 'pending' },
      ]);
    });
  });

  it('updates todos when the file content changes', async () => {
    mockFsPromises.readdir.mockResolvedValue(['plan.md']);
    mockFsPromises.lstat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 100,
    } as fs.Stats);

    mockFsPromises.readFile.mockResolvedValueOnce('- [ ] Initial Task');

    const { result } = renderHook(() => usePlanMonitoring(mockConfig));

    await waitFor(() => {
      expect(result.current.planTodos?.[0].description).toBe('Initial Task');
    });

    // Change mtime and content
    mockFsPromises.lstat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 200,
    } as fs.Stats);
    mockFsPromises.readFile.mockResolvedValueOnce('- [x] Completed Task');

    // Advance timers to trigger interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => {
      expect(result.current.planTodos?.[0].description).toBe('Completed Task');
      expect(result.current.planTodos?.[0].status).toBe('completed');
    });
  });

  it('clears todos when no markdown files are found', async () => {
    mockFsPromises.readdir.mockResolvedValueOnce(['plan.md']);
    mockFsPromises.lstat.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 100,
    } as fs.Stats);
    mockFsPromises.readFile.mockResolvedValue('- [ ] Task');

    const { result } = renderHook(() => usePlanMonitoring(mockConfig));

    await waitFor(() => {
      expect(result.current.planTodos).not.toBeNull();
    });

    mockFsPromises.readdir.mockResolvedValueOnce([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => {
      expect(result.current.planTodos).toBeNull();
      expect(result.current.planFileName).toBeNull();
    });
  });
});
