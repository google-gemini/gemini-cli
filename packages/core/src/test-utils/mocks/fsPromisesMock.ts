/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

/**
 * Centralized fs/promises mock factory for consistent test setup.
 * Implements DRY principle by providing reusable mock configurations.
 */
export function createFsPromisesMock() {
  return {
    default: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
      readdir: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      unlink: vi.fn(),
      rm: vi.fn(),
      rmdir: vi.fn(),
      readlink: vi.fn(),
      symlink: vi.fn(),
      lstat: vi.fn(),
      chmod: vi.fn(),
      chown: vi.fn(),
      copyFile: vi.fn(),
      rename: vi.fn(),
      appendFile: vi.fn(),
      realpath: vi.fn(),
      cp: vi.fn(),
      open: vi.fn(),
      truncate: vi.fn(),
      utimes: vi.fn(),
      watch: vi.fn(),
    },
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    rmdir: vi.fn(),
    readlink: vi.fn(),
    symlink: vi.fn(),
    lstat: vi.fn(),
    chmod: vi.fn(),
    chown: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
    appendFile: vi.fn(),
    realpath: vi.fn(),
    cp: vi.fn(),
    open: vi.fn(),
    truncate: vi.fn(),
    utimes: vi.fn(),
    watch: vi.fn(),
  };
}

/**
 * Standard vi.mock factory for fs/promises
 */
export function mockFsPromises() {
  return vi.mock('fs/promises', () => createFsPromisesMock());
}

/**
 * Standard vi.mock factory for node:fs/promises
 */
export function mockNodeFsPromises() {
  return vi.mock('node:fs/promises', () => createFsPromisesMock());
}
