/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  buildBaseBwrapArgs,
  bindExistingPaths,
  bindNodeBinary,
  BWRAP_OPTIONAL_LIB_PATHS,
  BWRAP_ESSENTIAL_ETC_FILES,
} from './bwrapUtils.js';

vi.mock('node:fs');

describe('buildBaseBwrapArgs', () => {
  it('should include all namespace isolation flags', () => {
    const args = buildBaseBwrapArgs('test-sandbox');
    expect(args).toContain('--new-session');
    expect(args).toContain('--die-with-parent');
    expect(args).toContain('--unshare-pid');
    expect(args).toContain('--unshare-user');
    expect(args).toContain('--unshare-ipc');
    expect(args).toContain('--unshare-uts');
    expect(args).toContain('--unshare-cgroup');
  });

  it('should set the provided hostname', () => {
    const args = buildBaseBwrapArgs('my-hostname');
    const idx = args.indexOf('--hostname');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe('my-hostname');
  });

  it('should mount /proc, /dev, and /dev/shm', () => {
    const args = buildBaseBwrapArgs('test');
    const procIdx = args.indexOf('--proc');
    expect(args[procIdx + 1]).toBe('/proc');
    const devIdx = args.indexOf('--dev');
    expect(args[devIdx + 1]).toBe('/dev');
    const shmIdx = args.indexOf('--tmpfs');
    expect(args[shmIdx + 1]).toBe('/dev/shm');
  });

  it('should ro-bind /usr, /bin, /sbin', () => {
    const args = buildBaseBwrapArgs('test');
    // Find all --ro-bind pairs
    const roBind: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--ro-bind') {
        roBind.push(args[i + 1]);
      }
    }
    expect(roBind).toContain('/usr');
    expect(roBind).toContain('/bin');
    expect(roBind).toContain('/sbin');
  });

  it('should not include --unshare-net (callers decide)', () => {
    const args = buildBaseBwrapArgs('test');
    expect(args).not.toContain('--unshare-net');
  });
});

describe('bindExistingPaths', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it('should append --ro-bind for paths that exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const args: string[] = [];
    bindExistingPaths(args, ['/lib', '/lib64']);
    expect(args).toEqual([
      '--ro-bind',
      '/lib',
      '/lib',
      '--ro-bind',
      '/lib64',
      '/lib64',
    ]);
  });

  it('should skip paths that do not exist', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === '/lib');
    const args: string[] = [];
    bindExistingPaths(args, ['/lib', '/lib64']);
    expect(args).toEqual(['--ro-bind', '/lib', '/lib']);
  });

  it('should use --bind when mode is specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const args: string[] = [];
    bindExistingPaths(args, ['/workspace'], '--bind');
    expect(args).toEqual(['--bind', '/workspace', '/workspace']);
  });

  it('should not modify args for empty paths list', () => {
    const args: string[] = ['--existing'];
    bindExistingPaths(args, []);
    expect(args).toEqual(['--existing']);
  });
});

describe('bindNodeBinary', () => {
  const originalExecPath = process.execPath;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'execPath', { value: originalExecPath });
  });

  it('should bind node binary and its directory when under homeDir', () => {
    Object.defineProperty(process, 'execPath', {
      value: '/home/user/.nvm/versions/node/v20/bin/node',
    });
    const args: string[] = [];
    bindNodeBinary(args, '/home/user');
    expect(args).toEqual([
      '--ro-bind',
      '/home/user/.nvm/versions/node/v20/bin/node',
      '/home/user/.nvm/versions/node/v20/bin/node',
      '--ro-bind',
      '/home/user/.nvm/versions/node/v20/bin',
      '/home/user/.nvm/versions/node/v20/bin',
    ]);
  });

  it('should not bind when node is not under homeDir', () => {
    Object.defineProperty(process, 'execPath', {
      value: '/usr/bin/node',
    });
    const args: string[] = [];
    bindNodeBinary(args, '/home/user');
    expect(args).toEqual([]);
  });
});

describe('constants', () => {
  it('BWRAP_OPTIONAL_LIB_PATHS should contain expected paths', () => {
    expect(BWRAP_OPTIONAL_LIB_PATHS).toContain('/lib');
    expect(BWRAP_OPTIONAL_LIB_PATHS).toContain('/lib64');
    expect(BWRAP_OPTIONAL_LIB_PATHS).toContain('/etc/alternatives');
  });

  it('BWRAP_ESSENTIAL_ETC_FILES should contain expected files', () => {
    expect(BWRAP_ESSENTIAL_ETC_FILES).toContain('/etc/passwd');
    expect(BWRAP_ESSENTIAL_ETC_FILES).toContain('/etc/group');
    expect(BWRAP_ESSENTIAL_ETC_FILES).toContain('/etc/hosts');
    expect(BWRAP_ESSENTIAL_ETC_FILES).toContain('/etc/nsswitch.conf');
  });
});
