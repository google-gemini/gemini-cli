/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import { getNormalizedRelativePath } from './ignorePathUtils.js';

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    resolve: vi.fn(actual.resolve),
    relative: vi.fn(actual.relative),
  };
});

describe('ignorePathUtils', () => {
  const projectRoot = path.resolve('/work/project');

  it('should return null for invalid inputs', () => {
    expect(getNormalizedRelativePath(projectRoot, '', false)).toBeNull();
    expect(
      getNormalizedRelativePath(projectRoot, null as unknown as string, false),
    ).toBeNull();
    expect(
      getNormalizedRelativePath(
        projectRoot,
        undefined as unknown as string,
        false,
      ),
    ).toBeNull();
  });

  it('should return null for paths outside the project root', () => {
    expect(
      getNormalizedRelativePath(projectRoot, '/work/other', false),
    ).toBeNull();
    expect(
      getNormalizedRelativePath(projectRoot, '../outside', false),
    ).toBeNull();
  });

  it('should return null for sibling directories with matching prefixes', () => {
    // If projectRoot is /work/project, /work/project-other should be null
    expect(
      getNormalizedRelativePath(
        projectRoot,
        '/work/project-other/file.txt',
        false,
      ),
    ).toBeNull();
  });

  it('should normalize basic relative paths', () => {
    expect(getNormalizedRelativePath(projectRoot, 'src/index.ts', false)).toBe(
      'src/index.ts',
    );
    expect(
      getNormalizedRelativePath(projectRoot, './src/index.ts', false),
    ).toBe('src/index.ts');
  });

  it('should normalize absolute paths within the root', () => {
    expect(
      getNormalizedRelativePath(
        projectRoot,
        path.join(projectRoot, 'src/file.ts'),
        false,
      ),
    ).toBe('src/file.ts');
  });

  it('should enforce trailing slash for directories', () => {
    expect(getNormalizedRelativePath(projectRoot, 'dist', true)).toBe('dist/');
    expect(getNormalizedRelativePath(projectRoot, 'dist/', true)).toBe('dist/');
  });

  it('should NOT add trailing slash for files even if string has one', () => {
    expect(getNormalizedRelativePath(projectRoot, 'dist/', false)).toBe('dist');
    expect(getNormalizedRelativePath(projectRoot, 'src/index.ts', false)).toBe(
      'src/index.ts',
    );
  });

  it('should convert Windows backslashes to forward slashes', () => {
    const winPath = 'src\\components\\Button.tsx';
    expect(getNormalizedRelativePath(projectRoot, winPath, false)).toBe(
      'src/components/Button.tsx',
    );

    const winDir = 'node_modules\\';
    expect(getNormalizedRelativePath(projectRoot, winDir, true)).toBe(
      'node_modules/',
    );
  });

  it('should handle the project root itself', () => {
    expect(getNormalizedRelativePath(projectRoot, projectRoot, true)).toBe('/');
    expect(getNormalizedRelativePath(projectRoot, '.', true)).toBe('/');
    expect(getNormalizedRelativePath(projectRoot, projectRoot, false)).toBe('');
    expect(getNormalizedRelativePath(projectRoot, '.', false)).toBe('');
  });

  it('should remove leading slashes from relative-looking paths', () => {
    expect(
      getNormalizedRelativePath(
        projectRoot,
        path.join(projectRoot, '/file.ts'),
        false,
      ),
    ).toBe('file.ts');
  });

  it('should reject Windows cross-drive absolute paths', () => {
    // Simulate Windows path resolution where cross-drive paths return an
    // absolute path without "..".
    vi.spyOn(path, 'resolve').mockImplementation(
      (...args) => args[args.length - 1],
    );
    vi.spyOn(path, 'relative').mockReturnValue('D:\\outside');

    expect(
      getNormalizedRelativePath('C:\\project', 'D:\\outside', false),
    ).toBeNull();
  });
});
