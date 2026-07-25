/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { watch, type FSWatcher } from 'chokidar';
import path from 'node:path';

export type FileWatcherEvent = {
  eventType: 'add' | 'unlink' | 'addDir' | 'unlinkDir';
  relativePath: string;
};

export type FileWatcherCallback = (event: FileWatcherEvent) => void;

type FileWatcherOptions = {
  shouldIgnore?: (relativePath: string) => boolean;
  onError?: (error: unknown) => void;
};

export class FileWatcher {
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly onEvent: FileWatcherCallback,
    private readonly options: FileWatcherOptions = {},
  ) {}

  private normalizeRelativePath(filePath: string): string {
    const relativeOrOriginal = path.isAbsolute(filePath)
      ? path.relative(this.projectRoot, filePath)
      : filePath;

    const normalized = relativeOrOriginal.replaceAll('\\', '/');
    if (normalized === '' || normalized === '.') {
      return '';
    }
    if (normalized.startsWith('./')) {
      return normalized.slice(2);
    }
    return normalized;
  }

  start(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = watch(this.projectRoot, {
      cwd: this.projectRoot,
      ignoreInitial: true,
      awaitWriteFinish: false,
      followSymlinks: false,
      persistent: true,
      ignored: (filePath: string) => {
        if (!this.options.shouldIgnore) {
          return false;
        }
        const relativePath = this.normalizeRelativePath(filePath);
        if (!relativePath) {
          return false;
        }
        return this.options.shouldIgnore(relativePath);
      },
    });

    this.watcher
      .on('add', (relativePath: string) => {
        this.onEvent({
          eventType: 'add',
          relativePath: this.normalizeRelativePath(relativePath),
        });
      })
      .on('unlink', (relativePath: string) => {
        this.onEvent({
          eventType: 'unlink',
          relativePath: this.normalizeRelativePath(relativePath),
        });
      })
      .on('addDir', (relativePath: string) => {
        this.onEvent({
          eventType: 'addDir',
          relativePath: this.normalizeRelativePath(relativePath),
        });
      })
      .on('unlinkDir', (relativePath: string) => {
        this.onEvent({
          eventType: 'unlinkDir',
          relativePath: this.normalizeRelativePath(relativePath),
        });
      })
      .on('error', (error: unknown) => {
        this.options.onError?.(error);
      });
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }
}
