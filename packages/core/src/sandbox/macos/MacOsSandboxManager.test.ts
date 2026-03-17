/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import * as seatbeltArgsBuilder from './seatbeltArgsBuilder.js';

describe('MacosSandboxManager', () => {
  it('should prepare command delegating to buildSeatbeltArgs', async () => {
    const buildArgsSpy = vi
      .spyOn(seatbeltArgsBuilder, 'buildSeatbeltArgs')
      .mockReturnValue([
        '-p',
        '(mock profile)',
        '-D',
        'WORKSPACE=/test/workspace',
      ]);

    const manager = new MacOsSandboxManager({
      workspace: '/test/workspace',
      allowedPaths: ['/test/allowed'],
      networkAccess: true,
    });

    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: '/test/workspace',
      env: { TEST: '1' },
    });

    expect(buildArgsSpy).toHaveBeenCalledWith({
      workspace: '/test/workspace',
      allowedPaths: ['/test/allowed'],
      networkAccess: true,
    });

    expect(result.program).toBe('/usr/bin/sandbox-exec');
    expect(result.args).toEqual([
      '-p',
      '(mock profile)',
      '-D',
      'WORKSPACE=/test/workspace',
      '--',
      'echo',
      'hello',
    ]);
    expect(result.cwd).toBe('/test/workspace');

    buildArgsSpy.mockRestore();
  });
});
