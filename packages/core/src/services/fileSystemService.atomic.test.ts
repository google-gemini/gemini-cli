/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StandardFileSystemService } from './fileSystemService.js';

describe('StandardFileSystemService (real filesystem atomicity)', () => {
  let tmpDir: string;
  let service: StandardFileSystemService;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'gemini-fs-atomic-'),
    );
    service = new StandardFileSystemService();
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  });

  it('never exposes a truncated or partial file size to concurrent observers during a 32 MiB overwrite', async () => {
    const targetPath = path.join(tmpDir, 'large-target.txt');
    const initialPayload = 'A'.repeat(4096);
    const nextPayload = 'B'.repeat(32 * 1024 * 1024); // 32 MiB payload (>64x libuv 512KiB chunk size)

    await fsPromises.writeFile(targetPath, initialPayload, 'utf-8');

    const observedSizes = new Set<number>();
    let sampleCount = 0;
    let writeDone = false;

    const writePromise = service
      .writeTextFile(targetPath, nextPayload)
      .finally(() => {
        writeDone = true;
      });

    // Perform synchronous batch sampling on the main V8 thread while the libuv
    // worker thread executes the write+rename, yielding via setImmediate so
    // libuv's poll phase can process worker completion callbacks.
    while (!writeDone) {
      for (let i = 0; i < 500; i++) {
        try {
          const st = fs.statSync(targetPath);
          observedSizes.add(st.size);
          sampleCount++;
        } catch {
          // Ignore transient stat error if any
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    await writePromise;
    observedSizes.add(fs.statSync(targetPath).size);

    expect(sampleCount).toBeGreaterThan(0);
    // Every observed size must be either the intact initial size (4096) or the complete new size (32 MiB), NEVER 0 or intermediate chunk multiples.
    for (const size of observedSizes) {
      expect([initialPayload.length, nextPayload.length]).toContain(size);
    }
    expect(await service.readTextFile(targetPath)).toBe(nextPayload);
  });

  it('preserves restricted 0o600 permissions when overwriting an existing file', async () => {
    if (os.platform() === 'win32') {
      return;
    }
    const secretPath = path.join(tmpDir, 'credentials.txt');
    await fsPromises.writeFile(secretPath, 'old-token', { mode: 0o600 });
    await fsPromises.chmod(secretPath, 0o600);

    await service.writeTextFile(secretPath, 'new-token');

    const stat = await fsPromises.stat(secretPath);
    expect(stat.mode & 0o777).toBe(0o600);
    expect(await service.readTextFile(secretPath)).toBe('new-token');
  });
});
