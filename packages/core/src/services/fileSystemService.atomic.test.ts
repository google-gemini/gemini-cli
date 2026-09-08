/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StandardFileSystemService } from './fileSystemService.js';

/**
 * These tests exercise the real filesystem on purpose: the behaviour under
 * test is what a concurrent observer can see on disk while a write is in
 * flight, which a mocked `fs` cannot express.
 */
describe('StandardFileSystemService atomicity', () => {
  let dir: string;
  let service: StandardFileSystemService;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gemini-atomic-write-'));
    service = new StandardFileSystemService();
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('never exposes a partially written file to a concurrent observer', async () => {
    // Large enough that the underlying write is split into several chunks;
    // old and new are the same length so any other size is a partial state.
    const SIZE = 16 * 1024 * 1024;
    const filePath = path.join(dir, 'large.txt');
    await fsp.writeFile(filePath, 'o'.repeat(SIZE), 'utf-8');

    // The write runs on the libuv threadpool, so a *synchronous* loop on the
    // main thread is what actually catches the destination mid-write. An
    // async reader tends to be scheduled only before or after it.
    const sizes = new Set<number>();
    let settled = false;
    const write = service
      .writeTextFile(filePath, 'n'.repeat(SIZE))
      .finally(() => {
        settled = true;
      });

    let spins = 0;
    while (!settled && spins < 2_000_000) {
      try {
        sizes.add(fs.statSync(filePath).size);
      } catch {
        // The destination may briefly not exist while being replaced.
        sizes.add(-1);
      }
      spins++;
      if (spins % 200 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    await write;

    // Guard against a vacuous pass where the observer never ran.
    expect(sizes.size).toBeGreaterThan(0);

    const partialStates = [...sizes].filter((size) => size !== SIZE);
    expect(partialStates).toEqual([]);
  });

  it('writes the requested content', async () => {
    const filePath = path.join(dir, 'content.txt');

    await service.writeTextFile(filePath, 'hello');

    await expect(fsp.readFile(filePath, 'utf-8')).resolves.toBe('hello');
  });

  it('preserves the permissions of an existing file', async () => {
    const filePath = path.join(dir, 'secret.txt');
    await fsp.writeFile(filePath, 'before', { mode: 0o600 });
    await fsp.chmod(filePath, 0o600);

    await service.writeTextFile(filePath, 'after');

    const stats = await fsp.stat(filePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('leaves no temporary files behind on success', async () => {
    const filePath = path.join(dir, 'clean.txt');

    await service.writeTextFile(filePath, 'done');

    await expect(fsp.readdir(dir)).resolves.toEqual(['clean.txt']);
  });
});
