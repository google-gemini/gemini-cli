/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StandardSandboxManager, SandboxProfile } from './sandboxManager.js';
import type { Config } from '../config/config.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    mkdtempSync: vi.fn().mockReturnValue('/tmp/gemini-sandbox-123'),
    writeFileSync: vi.fn(),
  };
});

describe('StandardSandboxManager', () => {
  const mockConfig = {
    getSandbox: vi.fn(),
  } as unknown as Config;

  const manager = new StandardSandboxManager(mockConfig);
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.stubGlobal('process', { ...process, platform: originalPlatform });
  });

  it('should return original command when sandbox is disabled', async () => {
    vi.mocked(mockConfig.getSandbox).mockReturnValue({ enabled: false });

    const result = await manager.prepareCommand({
      command: 'ls',
      args: ['-la'],
      cwd: '/tmp',
    });

    expect(result).toEqual({
      program: 'ls',
      args: ['-la'],
    });
  });

  it('should return original command when sandbox is undefined', async () => {
    vi.mocked(mockConfig.getSandbox).mockReturnValue(undefined);

    const result = await manager.prepareCommand({
      command: 'ls',
      args: ['-la'],
      cwd: '/tmp',
    });

    expect(result).toEqual({
      program: 'ls',
      args: ['-la'],
    });
  });

  it('should return sandboxed command on macOS when enabled', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.mocked(mockConfig.getSandbox).mockReturnValue({ enabled: true, allowedPaths: ['/extra/path'] });

    const result = await manager.prepareCommand({
      command: 'ls',
      args: ['-la'],
      cwd: '/my/workspace',
    });

    expect(result.program).toBe('/usr/bin/sandbox-exec');
    expect(result.args[0]).toBe('-f');
    expect(result.args[1]).toContain('sandbox.sb');
    expect(result.args[2]).toBe('ls');
    expect(result.args[3]).toBe('-la');

    // Verify profile content
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const profileContent = writeCall[1] as string;
    
    expect(profileContent).toContain('(version 1)');
    expect(profileContent).toContain('(deny default)');
    expect(profileContent).toContain('(allow pseudo-tty)');
    expect(profileContent).toContain('(subpath "/my/workspace")');
    expect(profileContent).toContain('(subpath "/extra/path")');
    expect(profileContent).toContain('(subpath "/usr/lib")');
    expect(profileContent).toContain('(allow file-read* file-write* (subpath "/my/workspace"))');
  });

  it('should use READ_ONLY profile when specified', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.mocked(mockConfig.getSandbox).mockReturnValue({ enabled: true });

    await manager.prepareCommand({
      command: 'grep',
      args: ['pattern'],
      cwd: '/my/workspace',
      profile: SandboxProfile.READ_ONLY,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const profileContent = writeCall[1] as string;

    expect(profileContent).toContain('(allow file-read* (subpath "/my/workspace"))');
    expect(profileContent).not.toContain('(allow file-read* file-write* (subpath "/my/workspace"))');
  });

  it('should use WORKSPACE_WRITE profile when explicitly specified', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.mocked(mockConfig.getSandbox).mockReturnValue({ enabled: true });

    await manager.prepareCommand({
      command: 'ls',
      args: ['-la'],
      cwd: '/my/workspace',
      profile: SandboxProfile.WORKSPACE_WRITE,
    });

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const profileContent = writeCall[1] as string;

    expect(profileContent).toContain('(allow file-read* file-write* (subpath "/my/workspace"))');
  });

  it('should fallback to original command if sandbox setup fails', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    vi.mocked(mockConfig.getSandbox).mockReturnValue({ enabled: true });
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Disk full');
    });

    const result = await manager.prepareCommand({
      command: 'ls',
      args: ['-la'],
      cwd: '/tmp',
    });

    expect(result).toEqual({
      program: 'ls',
      args: ['-la'],
    });
  });
});
