/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { GitInspectTool } from './GitInspectTool.js';
import { PermissionManager } from '../../permissions/PermissionManager.js';
import { CapabilityDeniedError } from '../../permissions/Capability.js';

describe('GitInspectTool', () => {
  const workspaceRoot = path.resolve(process.cwd());
  const permissions = new PermissionManager();

  it('runs git status and log', async () => {
    const tool = new GitInspectTool();
    const statusResult = await tool.execute({ command: 'status' }, { workspaceRoot, permissions });
    expect(typeof statusResult).toBe('string');

    const logResult = await tool.execute({ command: 'log', args: '-n 1 --oneline' }, { workspaceRoot, permissions });
    expect(typeof logResult).toBe('string');
    expect(logResult.length).toBeGreaterThan(0);
  });

  it('strictly denies git commit', async () => {
    const tool = new GitInspectTool();
    await expect(
      tool.execute({ command: 'commit' }, { workspaceRoot, permissions })
    ).rejects.toThrow(CapabilityDeniedError);
  });
});
