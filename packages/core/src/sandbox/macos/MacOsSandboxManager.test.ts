/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import * as seatbeltArgsBuilder from './seatbeltArgsBuilder.js';

describe('MacOsSandboxManager', () => {
  const mockWorkspace = '/test/workspace';
  const mockAllowedPaths = ['/test/allowed'];
  const mockNetworkAccess = true;

  let manager: MacOsSandboxManager;
  let buildArgsSpy: MockInstance<typeof seatbeltArgsBuilder.buildSeatbeltArgs>;

  beforeEach(() => {
    manager = new MacOsSandboxManager({
      workspace: mockWorkspace,
      allowedPaths: mockAllowedPaths,
      networkAccess: mockNetworkAccess,
    });

    buildArgsSpy = vi
      .spyOn(seatbeltArgsBuilder, 'buildSeatbeltArgs')
      .mockReturnValue([
        '-p',
        '(mock profile)',
        '-D',
        'WORKSPACE=/test/workspace',
      ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly invoke buildSeatbeltArgs with the configured options', async () => {
    await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: mockWorkspace,
      env: {},
    });

    expect(buildArgsSpy).toHaveBeenCalledWith({
      workspace: mockWorkspace,
      allowedPaths: mockAllowedPaths,
      networkAccess: mockNetworkAccess,
    });
  });

  it('should format the executable and arguments correctly for sandbox-exec', async () => {
    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: mockWorkspace,
      env: {},
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
  });

  it('should correctly pass through the cwd to the resulting command', async () => {
    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: '/test/different/cwd',
      env: {},
    });

    expect(result.cwd).toBe('/test/different/cwd');
  });

  it('should apply environment sanitization via the default mechanisms', async () => {
    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: mockWorkspace,
      env: {
        SAFE_VAR: '1',
        GITHUB_TOKEN: 'sensitive',
      },
    });

    expect(result.env['SAFE_VAR']).toBe('1');
    expect(result.env['GITHUB_TOKEN']).toBeUndefined();
  });
});
