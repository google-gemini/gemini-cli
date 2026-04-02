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
import * as fsUtils from '../utils/fsUtils.js';
import fs from 'node:fs';

vi.mock('../utils/fsUtils.js', async () => {
  const actual = await vi.importActual('../utils/fsUtils.js');
  return {
    ...actual,
    tryRealpath: vi.fn((p) => p),
    resolveGitWorktreePaths: vi.fn(() => ({})),
  };
});

describe('seatbeltArgsBuilder', () => {
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
      vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

      const profile = buildSeatbeltProfile({
        workspace: '/Users/test/workspace',
        allowedPaths: [],
        forbiddenPaths: [],
      });

      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny default)');
      expect(profile).toContain('(allow process-exec)');
      expect(profile).toContain(`(subpath "/Users/test/workspace")`);
      expect(profile).not.toContain('(allow network*)');
    });

    it('should allow network when networkAccess is true', () => {
      vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);
      const profile = buildSeatbeltProfile({
        workspace: '/test',
        allowedPaths: [],
        forbiddenPaths: [],
        networkAccess: true,
      });
      expect(profile).toContain('(allow network-outbound)');
    });

    describe('governance files', () => {
      it('should inject explicit deny rules for governance files', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p.toString());
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'lstatSync').mockImplementation(
          (p) =>
            ({
              isDirectory: () => p.toString().endsWith('.git'),
              isFile: () => !p.toString().endsWith('.git'),
            }) as unknown as fs.Stats,
        );

        const profile = buildSeatbeltProfile({
          workspace: '/test/workspace',
          allowedPaths: [],
          forbiddenPaths: [],
        });

        expect(profile).toContain(
          `(deny file-write* (literal "/test/workspace/.gitignore"))`,
        );

        expect(profile).toContain(
          `(deny file-write* (subpath "/test/workspace/.git"))`,
        );
      });

      it('should protect both the symlink and the real path if they differ', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => {
          if (p === '/test/workspace/.gitignore')
            return '/test/real/.gitignore';
          return p.toString();
        });
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'lstatSync').mockImplementation(
          () =>
            ({
              isDirectory: () => false,
              isFile: () => true,
            }) as unknown as fs.Stats,
        );

        const profile = buildSeatbeltProfile({
          workspace: '/test/workspace',
          allowedPaths: [],
          forbiddenPaths: [],
        });

        expect(profile).toContain(
          `(deny file-write* (literal "/test/workspace/.gitignore"))`,
        );
        expect(profile).toContain(
          `(deny file-write* (literal "/test/real/.gitignore"))`,
        );
      });
    });

    describe('allowedPaths', () => {
      it('should embed allowed paths and normalize them', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => {
          if (p === '/test/symlink') return '/test/real_path';
          return p;
        });

        const profile = buildSeatbeltProfile({
          workspace: '/test',
          allowedPaths: ['/custom/path1', '/test/symlink'],
          forbiddenPaths: [],
        });

        expect(profile).toContain(`(subpath "/custom/path1")`);
        expect(profile).toContain(`(subpath "/test/real_path")`);
      });
    });

    describe('forbiddenPaths', () => {
      it('should explicitly deny forbidden paths', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const profile = buildSeatbeltProfile({
          workspace: '/test',
          allowedPaths: [],
          forbiddenPaths: ['/secret/path'],
        });

        expect(profile).toContain(
          `(deny file-read* file-write* (subpath "/secret/path"))`,
        );
      });

      it('resolves forbidden symlink paths to their real paths', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => {
          if (p === '/test/symlink' || p === '/test/missing-dir') {
            return '/test/real_path';
          }
          return p;
        });

        const profile = buildSeatbeltProfile({
          workspace: '/test',
          allowedPaths: [],
          forbiddenPaths: ['/test/symlink'],
        });

        expect(profile).toContain(
          `(deny file-read* file-write* (subpath "/test/real_path"))`,
        );
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const profile = buildSeatbeltProfile({
          workspace: '/test',
          allowedPaths: [],
          forbiddenPaths: ['/test/missing-dir/missing-file.txt'],
        });

        expect(profile).toContain(
          `(deny file-read* file-write* (subpath "/test/missing-dir/missing-file.txt"))`,
        );
      });

      it('should override allowed paths if a path is also in forbidden paths', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const profile = buildSeatbeltProfile({
          workspace: '/test',
          allowedPaths: ['/custom/path1'],
          forbiddenPaths: ['/custom/path1'],
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
  });
});
