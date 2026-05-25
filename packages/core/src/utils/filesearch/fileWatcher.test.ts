/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupTmpDir, createTmpDir } from '@google/gemini-cli-test-utils';
import { FileWatcher, type FileWatcherEvent } from './fileWatcher.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForEvent = async (
  events: FileWatcherEvent[],
  predicate: (event: FileWatcherEvent) => boolean,
  timeoutMs = 4000,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (events.some(predicate)) {
      return;
    }
    await sleep(50);
  }
  throw new Error('Timed out waiting for watcher event');
};

describe('FileWatcher', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.map((dir) => cleanupTmpDir(dir)));
    tmpDirs.length = 0;
    vi.restoreAllMocks();
  });

  it('should emit relative add and unlink events for files', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(tmpDir, (event) => {
      events.push(event);
    });

    watcher.start();
    await sleep(500);

    const fileName = 'new-file.txt';
    const filePath = path.join(tmpDir, fileName);

    await fs.writeFile(filePath, 'hello');
    await sleep(1200);

    await fs.rm(filePath, { force: true });
    await sleep(1200);

    await watcher.close();

    expect(events).toContainEqual({ eventType: 'add', relativePath: fileName });
    expect(events).toContainEqual({
      eventType: 'unlink',
      relativePath: fileName,
    });
  });

  it('should skip ignored paths', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(
      tmpDir,
      (event) => {
        events.push(event);
      },
      {
        shouldIgnore: (relativePath) => relativePath.startsWith('ignored'),
      },
    );

    watcher.start();
    await sleep(500);

    await fs.writeFile(path.join(tmpDir, 'ignored.txt'), 'x');
    await fs.writeFile(path.join(tmpDir, 'kept.txt'), 'x');
    await sleep(1200);

    await watcher.close();

    expect(events.some((event) => event.relativePath === 'ignored.txt')).toBe(
      false,
    );
    expect(events).toContainEqual({
      eventType: 'add',
      relativePath: 'kept.txt',
    });
  });

  it('should emit addDir and unlinkDir events for directories', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(tmpDir, (event) => {
      events.push(event);
    });

    watcher.start();
    await sleep(500);

    const dirName = 'new-folder';
    const dirPath = path.join(tmpDir, dirName);

    await fs.mkdir(dirPath);
    await waitForEvent(
      events,
      (event) => event.eventType === 'addDir' && event.relativePath === dirName,
    );

    await fs.rm(dirPath, { recursive: true, force: true });
    await waitForEvent(
      events,
      (event) =>
        event.eventType === 'unlinkDir' && event.relativePath === dirName,
    );

    await watcher.close();
  });

  it('should normalize nested paths without leading dot prefix', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(tmpDir, (event) => {
      events.push(event);
    });

    watcher.start();
    await sleep(500);

    await fs.mkdir(path.join(tmpDir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'nested', 'file.txt'), 'data');

    await waitForEvent(
      events,
      (event) =>
        event.eventType === 'add' && event.relativePath === 'nested/file.txt',
    );

    const nestedFileEvent = events.find(
      (event) =>
        event.eventType === 'add' && event.relativePath.endsWith('/file.txt'),
    );

    expect(nestedFileEvent).toBeDefined();
    expect(nestedFileEvent!.relativePath.startsWith('./')).toBe(false);
    expect(nestedFileEvent!.relativePath.includes('\\')).toBe(false);

    await watcher.close();
  });

  it('should not emit new events after stop is called', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(tmpDir, (event) => {
      events.push(event);
    });

    watcher.start();
    await sleep(500);

    const beforeStopFile = path.join(tmpDir, 'before-stop.txt');
    await fs.writeFile(beforeStopFile, 'x');
    await waitForEvent(
      events,
      (event) =>
        event.eventType === 'add' && event.relativePath === 'before-stop.txt',
    );

    await watcher.close();

    const afterStopCount = events.length;
    await fs.writeFile(path.join(tmpDir, 'after-stop.txt'), 'x');
    await sleep(600);

    expect(events.length).toBe(afterStopCount);
  });

  it('should be safe to start and stop multiple times', async () => {
    const tmpDir = await createTmpDir({});
    tmpDirs.push(tmpDir);

    const events: FileWatcherEvent[] = [];
    const watcher = new FileWatcher(tmpDir, (event) => {
      events.push(event);
    });

    watcher.start();
    watcher.start();
    await sleep(500);

    await fs.writeFile(path.join(tmpDir, 'idempotent.txt'), 'x');
    await waitForEvent(
      events,
      (event) =>
        event.eventType === 'add' && event.relativePath === 'idempotent.txt',
    );

    await watcher.close();
    await watcher.close();

    expect(events.length).toBeGreaterThan(0);
  });
});
