/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSeatbeltArgs } from './seatbeltArgsBuilder.js';
import * as fsUtils from '../utils/fsUtils.js';
import fs from 'node:fs';
import os from 'node:os';

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

  describe('buildSeatbeltArgs', () => {
    it('should build a strict allowlist profile allowing the workspace via param', () => {
      vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

      const args = buildSeatbeltArgs({
        workspace: '/Users/test/workspace',
      });

      expect(args[0]).toBe('-p');
      const profile = args[1];
      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny default)');
      expect(profile).toContain('(allow process-exec)');
      expect(profile).toContain('(subpath (param "WORKSPACE"))');
      expect(profile).not.toContain('(allow network*)');

      expect(args).toContain('-D');
      expect(args).toContain('WORKSPACE=/Users/test/workspace');
      expect(args).toContain(`TMPDIR=${os.tmpdir()}`);
    });

    it('should allow network when networkAccess is true', () => {
      vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);
      const args = buildSeatbeltArgs({
        workspace: '/test',
        networkAccess: true,
      });
      const profile = args[1];
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

        const args = buildSeatbeltArgs({
          workspace: '/test/workspace',
        });
        const profile = args[1];

        expect(args).toContain('-D');
        expect(args).toContain('GOVERNANCE_FILE_0=/test/workspace/.gitignore');
        expect(profile).toContain(
          '(deny file-write* (literal (param "GOVERNANCE_FILE_0")))',
        );

        expect(args).toContain('GOVERNANCE_FILE_2=/test/workspace/.git');
        expect(profile).toContain(
          '(deny file-write* (subpath (param "GOVERNANCE_FILE_2")))',
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

        const args = buildSeatbeltArgs({ workspace: '/test/workspace' });
        const profile = args[1];

        expect(args).toContain('GOVERNANCE_FILE_0=/test/workspace/.gitignore');
        expect(args).toContain('REAL_GOVERNANCE_FILE_0=/test/real/.gitignore');
        expect(profile).toContain(
          '(deny file-write* (literal (param "GOVERNANCE_FILE_0")))',
        );
        expect(profile).toContain(
          '(deny file-write* (literal (param "REAL_GOVERNANCE_FILE_0")))',
        );
      });
    });

    describe('allowedPaths', () => {
      it('should parameterize allowed paths and normalize them', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => {
          if (p === '/test/symlink') return '/test/real_path';
          return p;
        });

        const args = buildSeatbeltArgs({
          workspace: '/test',
          allowedPaths: ['/custom/path1', '/test/symlink'],
        });

        const profile = args[1];
        expect(profile).toContain('(subpath (param "ALLOWED_PATH_0"))');
        expect(profile).toContain('(subpath (param "ALLOWED_PATH_1"))');

        expect(args).toContain('-D');
        expect(args).toContain('ALLOWED_PATH_0=/custom/path1');
        expect(args).toContain('ALLOWED_PATH_1=/test/real_path');
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const args = buildSeatbeltArgs({
          workspace: '/test',
          forbiddenPaths: ['/secret/path'],
        });

        const profile = args[1];

        expect(args).toContain('-D');
        expect(args).toContain('FORBIDDEN_PATH_0=/secret/path');

        expect(profile).toContain(
          '(deny file-read* file-write* (subpath (param "FORBIDDEN_PATH_0")))',
        );
      });

      it('resolves forbidden symlink paths to their real paths', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => {
          if (p === '/test/symlink' || p === '/test/missing-dir') {
            return '/test/real_path';
          }
          return p;
        });

        const args = buildSeatbeltArgs({
          workspace: '/test',
          forbiddenPaths: ['/test/symlink'],
        });

        const profile = args[1];

        expect(args).toContain('-D');
        expect(args).toContain('FORBIDDEN_PATH_0=/test/real_path');
        expect(profile).toContain(
          '(deny file-read* file-write* (subpath (param "FORBIDDEN_PATH_0")))',
        );
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const args = buildSeatbeltArgs({
          workspace: '/test',
          forbiddenPaths: ['/test/missing-dir/missing-file.txt'],
        });

        const profile = args[1];

        expect(args).toContain('-D');
        expect(args).toContain(
          'FORBIDDEN_PATH_0=/test/missing-dir/missing-file.txt',
        );
        expect(profile).toContain(
          '(deny file-read* file-write* (subpath (param "FORBIDDEN_PATH_0")))',
        );
      });

      it('should override allowed paths if a path is also in forbidden paths', () => {
        vi.mocked(fsUtils.tryRealpath).mockImplementation((p) => p);

        const args = buildSeatbeltArgs({
          workspace: '/test',
          allowedPaths: ['/custom/path1'],
          forbiddenPaths: ['/custom/path1'],
        });

        const profile = args[1];

        const allowString =
          '(allow file-read* file-write* (subpath (param "ALLOWED_PATH_0")))';
        const denyString =
          '(deny file-read* file-write* (subpath (param "FORBIDDEN_PATH_0")))';

        expect(profile).toContain(allowString);
        expect(profile).toContain(denyString);

        const allowIndex = profile.indexOf(allowString);
        const denyIndex = profile.indexOf(denyString);
        expect(denyIndex).toBeGreaterThan(allowIndex);
      });
    });
  });
});
