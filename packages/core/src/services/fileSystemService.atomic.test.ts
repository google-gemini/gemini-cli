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

    const partialStates = [...sizes].filter(
      (size) => size !== SIZE && size !== -1,
    );
    expect(partialStates).toEqual([]);
  });

  it('writes the requested content', async () => {
    const filePath = path.join(dir, 'content.txt');

    await service.writeTextFile(filePath, 'hello');

    await expect(fsp.readFile(filePath, 'utf-8')).resolves.toBe('hello');
  });

  it.skipIf(process.platform === 'win32')(
    'preserves the permissions of an existing file',
    async () => {
      const filePath = path.join(dir, 'secret.txt');
      await fsp.writeFile(filePath, 'before', { mode: 0o600 });
      await fsp.chmod(filePath, 0o600);

      await service.writeTextFile(filePath, 'after');

      const stats = await fsp.stat(filePath);
      expect(stats.mode & 0o777).toBe(0o600);
    },
  );

  it('leaves no temporary files behind on success', async () => {
    const filePath = path.join(dir, 'clean.txt');

    await service.writeTextFile(filePath, 'done');

    await expect(fsp.readdir(dir)).resolves.toEqual(['clean.txt']);
  });

  it('updates the target of a symlink without replacing the symlink itself', async () => {
    const targetPath = path.join(dir, 'target.txt');
    const symlinkPath = path.join(dir, 'link.txt');
    await fsp.writeFile(targetPath, 'original');
    await fsp.symlink(targetPath, symlinkPath);

    await service.writeTextFile(symlinkPath, 'updated');

    await expect(fsp.readFile(targetPath, 'utf-8')).resolves.toBe('updated');
    const lstat = await fsp.lstat(symlinkPath);
    expect(lstat.isSymbolicLink()).toBe(true);
  });

  // Windows limits the whole path (about 260 characters), so a 255-byte name
  // fails there for a different reason than the one under test.
  describe.skipIf(process.platform === 'win32')('long file names', () => {
    // A name of 215-255 bytes is legal, but the temp name is 41 bytes longer
    // and used to overflow NAME_MAX, failing with ENAMETOOLONG.
    it.each([214, 215, 254, 255])(
      'writes an ASCII name of %i bytes',
      async (nameBytes) => {
        const name = 'a'.repeat(nameBytes);
        expect(Buffer.byteLength(name)).toBe(nameBytes);
        const filePath = path.join(dir, name);

        await service.writeTextFile(filePath, 'hello');

        expect(await fsp.readFile(filePath, 'utf-8')).toBe('hello');
        // No temp file is left behind.
        expect(await fsp.readdir(dir)).toEqual([name]);
      },
    );

    it('writes a long multi-byte name without splitting a character', async () => {
      // 80 characters x 3 bytes + '.txt' = 244 bytes, over the 214-byte budget.
      const name = 'あ'.repeat(80) + '.txt';
      expect(Buffer.byteLength(name)).toBe(244);
      const filePath = path.join(dir, name);

      await service.writeTextFile(filePath, 'hello');

      expect(await fsp.readFile(filePath, 'utf-8')).toBe('hello');
      expect(await fsp.readdir(dir)).toEqual([name]);
    });

    it('overwrites an existing file with a long name', async () => {
      const name = 'b'.repeat(250) + '.txt';
      const filePath = path.join(dir, name);
      await fsp.writeFile(filePath, 'old', 'utf-8');

      await service.writeTextFile(filePath, 'new');

      expect(await fsp.readFile(filePath, 'utf-8')).toBe('new');
      expect(await fsp.readdir(dir)).toEqual([name]);
    });
  });
});
