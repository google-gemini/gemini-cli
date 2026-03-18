/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveForbiddenResources } from './forbiddenResourceService.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fdir } from 'fdir';

vi.mock('node:fs/promises');
vi.mock('fdir', () => ({ fdir: vi.fn() }));

function mockIgnoreFiles(files: Record<string, string>) {
  vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
    const fileName = path.basename(filePath.toString());
    if (fileName in files) return files[fileName];
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  });
}

function mockWorkspaceFiles(entries: Array<{ path: string; isDir: boolean }>) {
  const mockFdir = {
    withBasePath: vi.fn().mockReturnThis(),
    withPathSeparator: vi.fn().mockReturnThis(),
    withDirs: vi.fn().mockReturnThis(),
    exclude: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    crawl: vi.fn().mockReturnValue({
      withPromise: vi.fn().mockImplementation(async () => {
        const excludeCb = mockFdir.exclude.mock.calls[0]?.[0];
        const filterCb = mockFdir.filter.mock.calls[0]?.[0];

        for (const entry of entries) {
          const isExcluded =
            entry.isDir &&
            excludeCb?.(path.basename(entry.path), path.dirname(entry.path));

          if (!isExcluded) {
            filterCb?.(entry.path, entry.isDir);
          }
        }
        return [];
      }),
    }),
  };

  vi.mocked(fdir).mockImplementation(() => mockFdir as unknown as fdir);
}

describe('forbiddenResourceService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should resolve forbidden resources correctly from ignore files', async () => {
    mockIgnoreFiles({
      '.gitignore': 'node_modules/\n.env\n',
      '.geminiignore': 'secrets/\n',
    });

    mockWorkspaceFiles([
      { path: '/workspace/node_modules', isDir: true },
      { path: '/workspace/src', isDir: true },
      { path: '/workspace/src/index.ts', isDir: false },
      { path: '/workspace/.env', isDir: false },
      { path: '/workspace/secrets', isDir: true },
    ]);

    const resources = await resolveForbiddenResources('/workspace');

    expect(resources).toEqual(
      expect.arrayContaining([
        { absolutePath: '/workspace/node_modules', isDirectory: true },
        { absolutePath: '/workspace/.env', isDirectory: false },
        { absolutePath: '/workspace/secrets', isDirectory: true },
      ]),
    );
    expect(resources).toHaveLength(3);
  });

  it('should handle missing ignore files gracefully', async () => {
    mockIgnoreFiles({});

    mockWorkspaceFiles([
      { path: '/workspace/src', isDir: true },
      { path: '/workspace/src/index.ts', isDir: false },
    ]);

    const resources = await resolveForbiddenResources('/workspace');

    expect(resources).toEqual([]);
  });
});
