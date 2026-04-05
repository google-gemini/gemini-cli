/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createScopedWorkspaceContext,
  runWithScopedWorkspaceContext,
  getWorkspaceContextOverride,
} from './scoped-config.js';
import { Config } from './config.js';

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    resolveToRealPath: vi.fn((p) => p),
    isSubpath: (parent: string, child: string) => child.startsWith(parent),
  };
});

describe('createScopedWorkspaceContext', () => {
  let tempDir: string;
  let extraDir: string;
  let config: Config;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-config-'));
    extraDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-extra-'));

    config = new Config({
      targetDir: tempDir,
      sessionId: 'test-session',
      debugMode: false,
      cwd: tempDir,
      model: 'test-model',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(extraDir, { recursive: true, force: true });
  });

  it('should include parent workspace directories', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);
    const dirs = scoped.getDirectories();

    expect(dirs).toContain(fs.realpathSync(tempDir));
  });

  it('should include additional directories', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);
    const dirs = scoped.getDirectories();

    expect(dirs).toContain(fs.realpathSync(extraDir));
  });

  it('should not modify the parent workspace context', () => {
    const parentDirsBefore = [...config.getWorkspaceContext().getDirectories()];

    createScopedWorkspaceContext(config.getWorkspaceContext(), [extraDir]);

    const parentDirsAfter = [...config.getWorkspaceContext().getDirectories()];
    expect(parentDirsAfter).toEqual(parentDirsBefore);
    expect(parentDirsAfter).not.toContain(fs.realpathSync(extraDir));
  });

  it('should throw when parent context has no directories', () => {
    const emptyCtx = { getDirectories: () => [] } as unknown as ReturnType<
      typeof config.getWorkspaceContext
    >;
    expect(() => createScopedWorkspaceContext(emptyCtx, [extraDir])).toThrow(
      'parent has no directories',
    );
  });

  it('should return parent context unchanged when additionalDirectories is empty', () => {
    const parentCtx = config.getWorkspaceContext();
    const scoped = createScopedWorkspaceContext(parentCtx, []);
    expect(scoped).toBe(parentCtx);
  });

  it('should throw when adding a filesystem root directory', () => {
    expect(() =>
      createScopedWorkspaceContext(config.getWorkspaceContext(), ['/']),
    ).toThrow('Cannot add filesystem root');
  });
});

describe('runWithScopedWorkspaceContext', () => {
  let tempDir: string;
  let extraDir: string;
  let config: Config;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-run-'));
    extraDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-run-extra-'));

    config = new Config({
      targetDir: tempDir,
      sessionId: 'test-session',
      debugMode: false,
      cwd: tempDir,
      model: 'test-model',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(extraDir, { recursive: true, force: true });
  });

  it('should override Config.getWorkspaceContext() within scope', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);

    runWithScopedWorkspaceContext(scoped, () => {
      const ctx = config.getWorkspaceContext();
      expect(ctx).toBe(scoped);
      expect(ctx.getDirectories()).toContain(fs.realpathSync(extraDir));
    });
  });

  it('should not affect Config.getWorkspaceContext() outside scope', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);

    runWithScopedWorkspaceContext(scoped, () => {
      // Inside scope — overridden
      expect(config.getWorkspaceContext()).toBe(scoped);
    });

    // Outside scope — original
    const ctx = config.getWorkspaceContext();
    expect(ctx.getDirectories()).not.toContain(fs.realpathSync(extraDir));
  });

  it('should allow paths within scoped directories via Config.isPathAllowed()', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);
    // Use realpathSync because WorkspaceContext resolves symlinks internally
    const filePath = path.join(fs.realpathSync(extraDir), 'test.md');

    // Outside scope — not allowed
    expect(config.isPathAllowed(filePath)).toBe(false);

    // Inside scope — allowed
    runWithScopedWorkspaceContext(scoped, () => {
      expect(config.isPathAllowed(filePath)).toBe(true);
    });

    // After scope — not allowed again
    expect(config.isPathAllowed(filePath)).toBe(false);
  });

  it('should still allow parent workspace paths within scope', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);
    const filePath = path.join(fs.realpathSync(tempDir), 'src/index.ts');

    runWithScopedWorkspaceContext(scoped, () => {
      expect(config.isPathAllowed(filePath)).toBe(true);
    });
  });

  it('should work with async functions', async () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);

    await runWithScopedWorkspaceContext(scoped, async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 1));
      const ctx = config.getWorkspaceContext();
      expect(ctx).toBe(scoped);
    });
  });

  it('should return undefined from getWorkspaceContextOverride outside scope', () => {
    expect(getWorkspaceContextOverride()).toBeUndefined();
  });

  it('should return scoped context from getWorkspaceContextOverride inside scope', () => {
    const scoped = createScopedWorkspaceContext(config.getWorkspaceContext(), [
      extraDir,
    ]);

    runWithScopedWorkspaceContext(scoped, () => {
      expect(getWorkspaceContextOverride()).toBe(scoped);
    });
  });
});
