/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ReadFileTool } from './ReadFileTool.js';
import { PermissionManager } from '../../permissions/PermissionManager.js';
import { CapabilityDeniedError } from '../../permissions/Capability.js';

describe('ReadFileTool', () => {
  const workspaceRoot = path.resolve(process.cwd());
  const permissions = new PermissionManager();

  it('reads lines from an existing workspace file', async () => {
    const tool = new ReadFileTool();
    const result = await tool.execute(
      { path: 'package.json', startLine: 1, endLine: 5 },
      { workspaceRoot, permissions }
    );

    expect(result).toContain('package.json');
    expect(result).toContain('zoe');
  });

  it('blocks reading files outside workspaceRoot', async () => {
    const tool = new ReadFileTool();
    const result = await tool.execute(
      { path: '../../../../etc/passwd' },
      { workspaceRoot, permissions }
    );

    expect(result).toContain('Access denied');
  });

  it('blocks sibling-prefix paths and symlinks outside the workspace', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zoe-read-'));
    try {
      const root = path.join(temp, 'project');
      fs.mkdirSync(root);
      fs.mkdirSync(`${root}-private`);
      const secret = path.join(`${root}-private`, 'secret.txt');
      fs.writeFileSync(secret, 'private content');
      fs.symlinkSync(secret, path.join(root, 'link.txt'));
      const tool = new ReadFileTool();
      for (const target of [secret, 'link.txt']) {
        expect(await tool.execute({ path: target }, { workspaceRoot: root, permissions })).toContain('Access denied');
      }
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('respects permission check if filesystem.read is denied', async () => {
    const deniedPermissions = new PermissionManager({ 'filesystem.read': 'DENY' });
    const tool = new ReadFileTool();

    // Directly invoking with denied capability throws
    expect(() =>
      deniedPermissions.assertAllowed(tool.capability)
    ).toThrow(CapabilityDeniedError);
  });
});
