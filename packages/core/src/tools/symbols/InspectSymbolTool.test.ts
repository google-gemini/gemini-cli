/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { InspectSymbolTool } from './InspectSymbolTool.js';
import { WorkspaceSymbolIndex } from '../../indexer/WorkspaceSymbolIndex.js';

describe('InspectSymbolTool', () => {
  it('has read capability and locates symbol in index', async () => {
    const index = new WorkspaceSymbolIndex('/mock');
    index.indexFile('src/auth.ts', 'export class AuthManager { public login() {} }');

    const tool = new InspectSymbolTool(index);
    expect(tool.name).toBe('inspect_symbol');
    expect(tool.capability).toBe('filesystem.read');

    const result = await tool.execute({ name: 'AuthManager' }, {
      workspaceRoot: '/mock',
      permissions: {} as any,
    });

    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('AuthManager');
    expect(parsed[0].location).toBe('src/auth.ts:1');
    expect(parsed[0].exported).toBe(true);
  });

  it('returns helpful error when name is omitted or no symbol found', async () => {
    const index = new WorkspaceSymbolIndex('/mock');
    const tool = new InspectSymbolTool(index);

    const missingResult = await tool.execute({}, { workspaceRoot: '/mock', permissions: {} as any });
    expect(missingResult).toContain('Error: name parameter is required.');

    const notFoundResult = await tool.execute({ name: 'NonExistent' }, { workspaceRoot: '/mock', permissions: {} as any });
    expect(notFoundResult).toContain("No symbols found matching 'NonExistent'");
  });
});
