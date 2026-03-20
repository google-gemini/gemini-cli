/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { buildSeatbeltArgs } from './seatbeltArgsBuilder.js';
import fs from 'node:fs';
import os from 'node:os';

describe('seatbeltArgsBuilder', () => {
  it('should build a strict allowlist profile allowing the workspace via param', () => {
    // Mock realpathSync to just return the path for testing
    vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);

    const args = buildSeatbeltArgs({ workspace: '/Users/test/workspace' });

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

    vi.restoreAllMocks();
  });

  it('should allow network when networkAccess is true', () => {
    const args = buildSeatbeltArgs({ workspace: '/test', networkAccess: true });
    const profile = args[1];
    expect(profile).toContain('(allow network*)');
  });

  it('should parameterize allowed paths and normalize them', () => {
    vi.spyOn(fs, 'realpathSync').mockImplementation((p) => {
      if (p === '/test/symlink') return '/test/real_path';
      return p as string;
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

    vi.restoreAllMocks();
  });

  it('should resolve parent directories if a file does not exist', () => {
    vi.spyOn(fs, 'realpathSync').mockImplementation((p) => {
      if (p === '/test/symlink/nonexistent.txt') {
        const error = new Error('ENOENT');
        Object.assign(error, { code: 'ENOENT' });
        throw error;
      }
      if (p === '/test/symlink') {
        return '/test/real_path';
      }
      return p as string;
    });

    const args = buildSeatbeltArgs({
      workspace: '/test/symlink/nonexistent.txt',
    });

    expect(args).toContain('WORKSPACE=/test/real_path/nonexistent.txt');
    vi.restoreAllMocks();
  });

  it('should throw if realpathSync throws a non-ENOENT error', () => {
    vi.spyOn(fs, 'realpathSync').mockImplementation(() => {
      const error = new Error('Permission denied');
      Object.assign(error, { code: 'EACCES' });
      throw error;
    });

    expect(() =>
      buildSeatbeltArgs({
        workspace: '/test/workspace',
      }),
    ).toThrow('Permission denied');

    vi.restoreAllMocks();
  });
});
