/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { resolveSandboxPaths } from './sandboxPathUtils.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import path from 'node:path';

describe('resolveSandboxPaths', () => {
  it('should resolve allowed and forbidden paths', async () => {
    const workspace = path.resolve('/workspace');
    const forbidden = path.join(workspace, 'forbidden');
    const allowed = path.join(workspace, 'allowed');
    const options = {
      workspace,
      forbiddenPaths: async () => [forbidden],
    };
    const req = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [allowed],
      },
    };

    const result = await resolveSandboxPaths(options, req as SandboxRequest);

    expect(result.policyAllowed).toEqual([allowed]);
    expect(result.forbidden).toEqual([forbidden]);
  });

  it('should filter out workspace from allowed paths', async () => {
    const workspace = path.resolve('/workspace');
    const other = path.resolve('/other/path');
    const options = {
      workspace,
    };
    const req = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [workspace, workspace + path.sep, other],
      },
    };

    const result = await resolveSandboxPaths(options, req as SandboxRequest);

    expect(result.policyAllowed).toEqual([other]);
  });

  it('should prioritize forbidden paths over allowed paths', async () => {
    const workspace = path.resolve('/workspace');
    const secret = path.join(workspace, 'secret');
    const normal = path.join(workspace, 'normal');
    const options = {
      workspace,
      forbiddenPaths: async () => [secret],
    };
    const req = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [secret, normal],
      },
    };

    const result = await resolveSandboxPaths(options, req as SandboxRequest);

    expect(result.policyAllowed).toEqual([normal]);
    expect(result.forbidden).toEqual([secret]);
  });

  it('should handle case-insensitive conflicts on supported platforms', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const workspace = path.resolve('/workspace');
    const secretUpper = path.join(workspace, 'SECRET');
    const secretLower = path.join(workspace, 'secret');
    const options = {
      workspace,
      forbiddenPaths: async () => [secretUpper],
    };
    const req = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [secretLower],
      },
    };

    const result = await resolveSandboxPaths(options, req as SandboxRequest);

    expect(result.policyAllowed).toEqual([]);
    expect(result.forbidden).toEqual([secretUpper]);
  });
});
