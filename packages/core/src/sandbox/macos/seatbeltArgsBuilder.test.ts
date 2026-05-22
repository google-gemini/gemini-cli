/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildSeatbeltProfile,
  escapeSchemeString,
} from './seatbeltArgsBuilder.js';
import type { ResolvedSandboxPaths } from '../../services/sandboxManager.js';
import fs from 'node:fs';
import os from 'node:os';

const defaultResolvedPaths: ResolvedSandboxPaths = {
  workspace: {
    resolved: '/Users/test/workspace',
    original: '/Users/test/raw-workspace',
  },
  forbidden: [],
  globalIncludes: [],
  policyAllowed: [],
  policyRead: [],
  policyWrite: [],
};

describe.skipIf(os.platform() === 'win32')('seatbeltArgsBuilder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('escapeSchemeString', () => {
    it('escapes quotes and backslashes', () => {
      expect(escapeSchemeString('path/to/"file"')).toBe('path/to/\\"file\\"');
      expect(escapeSchemeString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });
  });

  describe('buildSeatbeltProfile', () => {
    it('should build a strict allowlist profile allowing the workspace', () => {
      const profile = buildSeatbeltProfile({
        resolvedPaths: defaultResolvedPaths,
      });

      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny default)');
      expect(profile).toContain('(allow process-exec)');
      expect(profile).toContain(`(subpath "/Users/test/workspace")`);
      expect(profile).not.toContain('(allow network*)');
    });

    it('should allow network when networkAccess is true', () => {
      const profile = buildSeatbeltProfile({
        resolvedPaths: {
          ...defaultResolvedPaths,
          workspace: { resolved: '/test', original: '/test' },
        },
        networkAccess: true,
      });
      expect(profile).toContain('(allow network-outbound)');
    });

    describe('governance files', () => {
      it('should inject explicit deny rules for governance files', () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'lstatSync').mockImplementation(
          (p) =>
            ({
              isDirectory: () => p.toString().endsWith('.git'),
              isFile: () => !p.toString().endsWith('.git'),
            }) as unknown as fs.Stats,
        );

        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            workspace: {
              resolved: '/test/workspace',
              original: '/test/workspace',
            },
          },
        });

        expect(profile).toContain(
          `(deny file-write* (literal "/test/workspace/.gitignore"))`,
        );

        expect(profile).toContain(
          `(deny file-write* (subpath "/test/workspace/.git"))`,
        );
      });
    });

    describe('allowedPaths', () => {
      it('should embed allowed paths', () => {
        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            workspace: { resolved: '/test', original: '/test' },
            policyAllowed: ['/custom/path1', '/test/real_path'],
          },
        });

        expect(profile).toContain(`(subpath "/custom/path1")`);
        expect(profile).toContain(`(subpath "/test/real_path")`);
      });
    });

    describe('forbiddenPaths', () => {
      it('should explicitly deny forbidden paths', () => {
        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            workspace: { resolved: '/test', original: '/test' },
            forbidden: ['/secret/path'],
          },
        });

        expect(profile).toContain(
          `(deny file-read* file-write* (subpath "/secret/path"))`,
        );
      });

      it('should override allowed paths if a path is also in forbidden paths', () => {
        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            workspace: { resolved: '/test', original: '/test' },
            policyAllowed: ['/custom/path1'],
            forbidden: ['/custom/path1'],
          },
        });

        const allowString = `(allow file-read* file-write* (subpath "/custom/path1"))`;
        const denyString = `(deny file-read* file-write* (subpath "/custom/path1"))`;

        expect(profile).toContain(allowString);
        expect(profile).toContain(denyString);

        const allowIndex = profile.indexOf(allowString);
        const denyIndex = profile.indexOf(denyString);
        expect(denyIndex).toBeGreaterThan(allowIndex);
      });
    });

    describe('git worktree paths', () => {
      it('enforces read-only binding for git worktrees even if workspaceWrite is true', () => {
        const worktreeGitDir = '/path/to/worktree/.git';
        const mainGitDir = '/path/to/main/.git';

        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            gitWorktree: {
              worktreeGitDir,
              mainGitDir,
            },
          },
          workspaceWrite: true,
        });

        // Should grant read access
        expect(profile).toContain(
          `(allow file-read* (subpath "${worktreeGitDir}"))`,
        );
        expect(profile).toContain(
          `(allow file-read* (subpath "${mainGitDir}"))`,
        );

        // Should NOT grant write access
        expect(profile).not.toContain(
          `(allow file-read* file-write* (subpath "${worktreeGitDir}"))`,
        );
        expect(profile).not.toContain(
          `(allow file-read* file-write* (subpath "${mainGitDir}"))`,
        );
      });

      it('git worktree read-only rules should override previous policyAllowed write paths', () => {
        const worktreeGitDir = '/custom/worktree/.git';
        const profile = buildSeatbeltProfile({
          resolvedPaths: {
            ...defaultResolvedPaths,
            policyAllowed: ['/custom/worktree'],
            gitWorktree: {
              worktreeGitDir,
            },
          },
        });

        const allowString = `(allow file-read* file-write* (subpath "/custom/worktree"))`;
        const denyString = `(deny file-write* (subpath "${worktreeGitDir}"))`;

        expect(profile).toContain(allowString);
        expect(profile).toContain(denyString);

        const allowIndex = profile.indexOf(allowString);
        const denyIndex = profile.indexOf(denyString);
        expect(denyIndex).toBeGreaterThan(allowIndex);
      });
    });
  });
});
