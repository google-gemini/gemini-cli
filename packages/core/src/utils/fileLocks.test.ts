/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withFileLock } from './fileLocks.js';

describe('withFileLock', () => {
  it('serializes overlapping calls against the same path', async () => {
    // Two tasks acquire the lock for the same path. Each one records its
    // start and end in a shared log. If serialized correctly, B does not
    // start until A has ended.
    const log: string[] = [];
    const taskA = async () => {
      log.push('A:start');
      await delay(20);
      log.push('A:end');
    };
    const taskB = async () => {
      log.push('B:start');
      await delay(5);
      log.push('B:end');
    };

    await Promise.all([
      withFileLock('/tmp/race.txt', taskA),
      withFileLock('/tmp/race.txt', taskB),
    ]);

    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('allows concurrent calls against different paths', async () => {
    // Tasks on different paths must not block each other.
    const log: string[] = [];
    const slow = async () => {
      log.push('slow:start');
      await delay(30);
      log.push('slow:end');
    };
    const fast = async () => {
      log.push('fast:start');
      await delay(1);
      log.push('fast:end');
    };

    await Promise.all([
      withFileLock('/tmp/a.txt', slow),
      withFileLock('/tmp/b.txt', fast),
    ]);

    // The fast task on /tmp/b.txt finishes before the slow task on /tmp/a.txt.
    expect(log).toEqual(['slow:start', 'fast:start', 'fast:end', 'slow:end']);
  });

  it('releases the lock after a thrown error so subsequent calls run', async () => {
    const fail = withFileLock('/tmp/err.txt', async () => {
      throw new Error('boom');
    });
    await expect(fail).rejects.toThrow('boom');

    // Lock should be free; the next call must run.
    const result = await withFileLock('/tmp/err.txt', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('normalises paths so equivalent inputs share the lock', async () => {
    const log: string[] = [];
    const taskA = async () => {
      log.push('A:start');
      await delay(15);
      log.push('A:end');
    };
    const taskB = async () => {
      log.push('B:start');
      log.push('B:end');
    };

    await Promise.all([
      withFileLock('/tmp/dup.txt', taskA),
      withFileLock('/tmp/./dup.txt', taskB),
    ]);

    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  describe('symlink and case-sensitivity normalization', () => {
    let tempDir: string;
    afterEach(() => {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('shares the lock between a real path and a symlink pointing to it', async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-lock-symlink-'));
      const realPath = path.join(tempDir, 'target.txt');
      const linkPath = path.join(tempDir, 'alias.txt');
      fs.writeFileSync(realPath, 'hello');
      fs.symlinkSync(realPath, linkPath);

      const log: string[] = [];
      const taskA = async () => {
        log.push('A:start');
        await delay(15);
        log.push('A:end');
      };
      const taskB = async () => {
        log.push('B:start');
        log.push('B:end');
      };

      await Promise.all([
        withFileLock(realPath, taskA),
        withFileLock(linkPath, taskB),
      ]);

      // If the symlink had a separate lock, B would start before A ended.
      expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
    });

    if (process.platform === 'darwin' || process.platform === 'win32') {
      it('shares the lock between two case-different paths on a case-insensitive filesystem', async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-lock-case-'));
        const lowerPath = path.join(tempDir, 'mixed.txt');
        const upperPath = path.join(tempDir, 'MIXED.TXT');
        fs.writeFileSync(lowerPath, 'hello');

        const log: string[] = [];
        const taskA = async () => {
          log.push('A:start');
          await delay(15);
          log.push('A:end');
        };
        const taskB = async () => {
          log.push('B:start');
          log.push('B:end');
        };

        await Promise.all([
          withFileLock(lowerPath, taskA),
          withFileLock(upperPath, taskB),
        ]);

        expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
      });
    }
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
