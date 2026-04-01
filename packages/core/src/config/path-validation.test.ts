/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from './config.js';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({
      isDirectory: vi.fn().mockReturnValue(true),
    }),
    realpathSync: vi.fn((p) => p),
  };
});

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    resolveToRealPath: vi.fn((p) => p),
    isSubpath: (parent: string, child: string) => child.startsWith(parent),
  };
});

describe('Config Path Validation', () => {
  let config: Config;
  const targetDir = '/mock/workspace';
  const globalGeminiDir = path.join(os.homedir(), '.gemini');

  beforeEach(() => {
    config = new Config({
      targetDir,
      sessionId: 'test-session',
      debugMode: false,
      cwd: targetDir,
      model: 'test-model',
    });
  });

  it('should allow access to ~/.gemini if it is added to the workspace', () => {
    const geminiMdPath = path.join(globalGeminiDir, 'GEMINI.md');

    // Before adding, it should be denied
    expect(config.isPathAllowed(geminiMdPath)).toBe(false);

    // Add to workspace
    config.getWorkspaceContext().addDirectory(globalGeminiDir);

    // Now it should be allowed
    expect(config.isPathAllowed(geminiMdPath)).toBe(true);
    expect(config.validatePathAccess(geminiMdPath, 'read')).toBeNull();
    expect(config.validatePathAccess(geminiMdPath, 'write')).toBeNull();
  });

  it('should still allow project workspace paths', () => {
    const workspacePath = path.join(targetDir, 'src/index.ts');
    expect(config.isPathAllowed(workspacePath)).toBe(true);
    expect(config.validatePathAccess(workspacePath, 'read')).toBeNull();
  });

  describe('runWithWorkspaceScope', () => {
    it('should temporarily extend workspace with additional directories', async () => {
      const geminiMdPath = path.join(globalGeminiDir, 'GEMINI.md');

      // Before scope, should be denied
      expect(
        config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
      ).toBe(false);

      await config.runWithWorkspaceScope([globalGeminiDir], async () => {
        // During scope, should be allowed
        expect(
          config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
        ).toBe(true);
        expect(config.getWorkspaceContext().getDirectories()).toContain(
          globalGeminiDir,
        );
      });

      // After scope, should be denied again
      expect(
        config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
      ).toBe(false);
      expect(config.getWorkspaceContext().getDirectories()).not.toContain(
        globalGeminiDir,
      );
    });

    it('should run fn directly when given empty array', async () => {
      const dirsBefore = config.getWorkspaceContext().getDirectories();
      await config.runWithWorkspaceScope([], async () => {
        const dirsInside = config.getWorkspaceContext().getDirectories();
        expect(dirsInside).toEqual(dirsBefore);
      });
    });

    it('should support nested scopes', async () => {
      const extraDir = '/mock/extra';
      const geminiMdPath = path.join(globalGeminiDir, 'GEMINI.md');
      const extraPath = path.join(extraDir, 'file.txt');

      await config.runWithWorkspaceScope([globalGeminiDir], async () => {
        expect(
          config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
        ).toBe(true);
        expect(
          config.getWorkspaceContext().isPathWithinWorkspace(extraPath),
        ).toBe(false);

        await config.runWithWorkspaceScope([extraDir], async () => {
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
          ).toBe(true);
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(extraPath),
          ).toBe(true);
        });

        // After inner scope pops, extraPath should be denied
        expect(
          config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
        ).toBe(true);
        expect(
          config.getWorkspaceContext().isPathWithinWorkspace(extraPath),
        ).toBe(false);
      });

      // After all scopes pop
      expect(
        config.getWorkspaceContext().isPathWithinWorkspace(geminiMdPath),
      ).toBe(false);
    });

    it('should isolate concurrent scopes from each other', async () => {
      const dirA = '/mock/dir-a';
      const dirB = '/mock/dir-b';
      const pathA = path.join(dirA, 'a.txt');
      const pathB = path.join(dirB, 'b.txt');

      await Promise.all([
        config.runWithWorkspaceScope([dirA], async () => {
          // Agent A should see dirA but not dirB
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathA),
          ).toBe(true);
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathB),
          ).toBe(false);
          // Simulate async work to ensure interleaving
          await new Promise((r) => setTimeout(r, 10));
          // Still isolated after yielding
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathA),
          ).toBe(true);
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathB),
          ).toBe(false);
        }),
        config.runWithWorkspaceScope([dirB], async () => {
          // Agent B should see dirB but not dirA
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathB),
          ).toBe(true);
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathA),
          ).toBe(false);
          await new Promise((r) => setTimeout(r, 10));
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathB),
          ).toBe(true);
          expect(
            config.getWorkspaceContext().isPathWithinWorkspace(pathA),
          ).toBe(false);
        }),
      ]);

      // After both complete, neither should be visible
      expect(config.getWorkspaceContext().isPathWithinWorkspace(pathA)).toBe(
        false,
      );
      expect(config.getWorkspaceContext().isPathWithinWorkspace(pathB)).toBe(
        false,
      );
    });
  });
});
