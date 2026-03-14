/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { BwrapSandboxManager } from './bwrapSandboxManager.js';
import type { SandboxRequest } from './sandboxManager.js';

vi.mock('node:os');
vi.mock('node:fs');

function makeRequest(overrides?: Partial<SandboxRequest>): SandboxRequest {
  return {
    command: 'git',
    args: ['status'],
    cwd: '/home/user/project',
    env: { PATH: '/usr/bin', HOME: '/home/user', SAFE_VAR: 'ok' },
    ...overrides,
  };
}

describe('BwrapSandboxManager', () => {
  const manager = new BwrapSandboxManager();

  beforeEach(() => {
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('on Linux', () => {
    it('should wrap command with bwrap', async () => {
      const result = await manager.prepareCommand(makeRequest());
      expect(result.program).toBe('bwrap');
      expect(result.args).toContain('--');
      // The original command and args should appear after --
      const separatorIdx = result.args.indexOf('--');
      expect(result.args[separatorIdx + 1]).toBe('git');
      expect(result.args[separatorIdx + 2]).toBe('status');
    });

    it('should always disable network access for tools', async () => {
      const result = await manager.prepareCommand(makeRequest());
      expect(result.args).toContain('--unshare-net');
    });

    it('should set hostname to gemini-tool-sandbox', async () => {
      const result = await manager.prepareCommand(makeRequest());
      const idx = result.args.indexOf('--hostname');
      expect(result.args[idx + 1]).toBe('gemini-tool-sandbox');
    });

    it('should include namespace isolation flags', async () => {
      const result = await manager.prepareCommand(makeRequest());
      expect(result.args).toContain('--unshare-pid');
      expect(result.args).toContain('--unshare-user');
      expect(result.args).toContain('--unshare-ipc');
      expect(result.args).toContain('--unshare-uts');
      expect(result.args).toContain('--unshare-cgroup');
    });

    it('should bind the workdir read-write', async () => {
      const result = await manager.prepareCommand(makeRequest());
      const bindPairs: string[] = [];
      for (let i = 0; i < result.args.length; i++) {
        if (result.args[i] === '--bind') {
          bindPairs.push(result.args[i + 1]);
        }
      }
      expect(bindPairs).toContain('/home/user/project');
    });

    it('should mount .gemini settings read-only when present', async () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === '/home/user/.gemini',
      );
      const result = await manager.prepareCommand(makeRequest());
      const roBindPairs: string[] = [];
      for (let i = 0; i < result.args.length; i++) {
        if (result.args[i] === '--ro-bind') {
          roBindPairs.push(result.args[i + 1]);
        }
      }
      expect(roBindPairs).toContain('/home/user/.gemini');
    });

    it('should not mount .gemini when it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = await manager.prepareCommand(makeRequest());
      const allArgs = result.args.join(' ');
      expect(allArgs).not.toContain('.gemini');
    });

    it('should isolate /tmp and /run/user with tmpfs', async () => {
      const result = await manager.prepareCommand(makeRequest());
      const tmpfsPaths: string[] = [];
      for (let i = 0; i < result.args.length; i++) {
        if (result.args[i] === '--tmpfs') {
          tmpfsPaths.push(result.args[i + 1]);
        }
      }
      expect(tmpfsPaths).toContain('/tmp');
      expect(tmpfsPaths).toContain('/run/user');
    });

    it('should set HOME to /tmp in the environment', async () => {
      const result = await manager.prepareCommand(makeRequest());
      expect(result.env['HOME']).toBe('/tmp');
    });

    it('should set cwd to the resolved workdir', async () => {
      const result = await manager.prepareCommand(makeRequest());
      expect(result.cwd).toBe('/home/user/project');
    });

    it('should sanitize the environment', async () => {
      const req = makeRequest({
        env: {
          PATH: '/usr/bin',
          GITHUB_TOKEN: 'ghp_secret',
          SAFE_VAR: 'ok',
        },
      });
      const result = await manager.prepareCommand(req);
      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['SAFE_VAR']).toBe('ok');
      expect(result.env['GITHUB_TOKEN']).toBeUndefined();
    });
  });

  describe('on non-Linux platforms', () => {
    it('should pass through command without bwrap wrapping', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      const result = await manager.prepareCommand(makeRequest());
      expect(result.program).toBe('git');
      expect(result.args).toEqual(['status']);
    });

    it('should still sanitize the environment', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      const req = makeRequest({
        env: { PATH: '/usr/bin', GITHUB_TOKEN: 'ghp_secret' },
      });
      const result = await manager.prepareCommand(req);
      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['GITHUB_TOKEN']).toBeUndefined();
    });
  });
});
