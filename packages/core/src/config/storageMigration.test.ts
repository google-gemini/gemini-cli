/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.unmock('./storageMigration.js');

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StorageMigration } from './storageMigration.js';

describe('StorageMigration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-migration-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('migrates a directory from old to new path (non-destructively)', async () => {
    const oldPath = path.join(tempDir, 'old-hash');
    const newPath = path.join(tempDir, 'new-slug');
    fs.mkdirSync(oldPath);
    fs.writeFileSync(path.join(oldPath, 'test.txt'), 'hello');

    await StorageMigration.migrateDirectory(oldPath, newPath);

    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(oldPath)).toBe(true); // Should still exist
    expect(fs.readFileSync(path.join(newPath, 'test.txt'), 'utf8')).toBe(
      'hello',
    );
  });

  it('does nothing if old path does not exist', async () => {
    const oldPath = path.join(tempDir, 'non-existent');
    const newPath = path.join(tempDir, 'new-slug');

    await StorageMigration.migrateDirectory(oldPath, newPath);

    expect(fs.existsSync(newPath)).toBe(false);
  });

  it('does nothing if new path already exists', async () => {
    const oldPath = path.join(tempDir, 'old-hash');
    const newPath = path.join(tempDir, 'new-slug');
    fs.mkdirSync(oldPath);
    fs.mkdirSync(newPath);
    fs.writeFileSync(path.join(oldPath, 'old.txt'), 'old');
    fs.writeFileSync(path.join(newPath, 'new.txt'), 'new');

    await StorageMigration.migrateDirectory(oldPath, newPath);

    expect(fs.existsSync(oldPath)).toBe(true);
    expect(fs.existsSync(path.join(newPath, 'new.txt'))).toBe(true);
    expect(fs.existsSync(path.join(newPath, 'old.txt'))).toBe(false);
  });

  it('creates parent directory for new path if it does not exist', async () => {
    const oldPath = path.join(tempDir, 'old-hash');
    const newPath = path.join(tempDir, 'sub', 'new-slug');
    fs.mkdirSync(oldPath);

    await StorageMigration.migrateDirectory(oldPath, newPath);

    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(oldPath)).toBe(true); // Should still exist
  });
});
