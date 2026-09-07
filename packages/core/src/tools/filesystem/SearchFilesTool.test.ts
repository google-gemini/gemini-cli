/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { SearchFilesTool } from './SearchFilesTool.js';
import { PermissionManager } from '../../permissions/PermissionManager.js';

describe('SearchFilesTool', () => {
  const workspaceRoot = path.resolve(process.cwd());
  const permissions = new PermissionManager();

  it('finds files matching pattern', async () => {
    const tool = new SearchFilesTool();
    const result = await tool.execute(
      { pattern: 'package.json' },
      { workspaceRoot, permissions }
    );

    expect(result).toContain('package.json');
  });

  it('greps text content across files', async () => {
    const tool = new SearchFilesTool();
    const result = await tool.execute(
      { pattern: 'package.json', query: 'zoe' },
      { workspaceRoot, permissions }
    );

    expect(result).toContain('zoe');
  });
});
