/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import type { SandboxRequest } from './sandboxManager.js';

describe('WindowsSandboxManager', () => {
  const manager = new WindowsSandboxManager('win32');

  it('should prepare a GeminiSandbox.exe command', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: ['/groups'],
      cwd: '/test/cwd',
      env: { TEST_VAR: 'test_value' },
      config: {
        networkAccess: false,
      },
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toContain('GeminiSandbox.exe');
    expect(result.args).toEqual(['0', '/test/cwd', 'whoami', '/groups']);
  });

  it('should handle networkAccess from config', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: '/test/cwd',
      env: {},
      config: {
        networkAccess: true,
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1');
  });

  it('should sanitize environment variables', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: '/test/cwd',
      env: {
        API_KEY: 'secret',
        PATH: '/usr/bin',
      },
      config: {
        sanitizationConfig: {
          allowedEnvironmentVariables: ['PATH'],
          blockedEnvironmentVariables: ['API_KEY'],
          enableEnvironmentVariableRedaction: true,
        },
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.env['PATH']).toBe('/usr/bin');
    expect(result.env['API_KEY']).toBeUndefined();
  });

  describe('non-win32 platform', () => {
    it('should skip icacls and complete successfully on linux', async () => {
      const linuxManager = new WindowsSandboxManager('linux');
      const req: SandboxRequest = {
        command: 'ls',
        args: ['-la'],
        cwd: '/home/user/project',
        env: {},
        config: { networkAccess: false },
      };
      const result = await linuxManager.prepareCommand(req);
      expect(result.program).toContain('GeminiSandbox.exe');
      expect(result.args).toEqual(['0', '/home/user/project', 'ls', '-la']);
    });

    it('should skip icacls and complete successfully on darwin', async () => {
      const macManager = new WindowsSandboxManager('darwin');
      const req: SandboxRequest = {
        command: 'echo',
        args: ['hello'],
        cwd: '/Users/test/project',
        env: {},
        config: { networkAccess: true },
      };
      const result = await macManager.prepareCommand(req);
      expect(result.args[0]).toBe('1');
    });
  });

  describe('allowedPaths in config', () => {
    it('should include command and args correctly when allowedPaths is provided', async () => {
      const manager2 = new WindowsSandboxManager('linux');
      const req: SandboxRequest = {
        command: 'node',
        args: ['index.js'],
        cwd: '/project',
        env: {},
        config: {
          networkAccess: false,
          allowedPaths: ['/project/data', '/tmp/output'],
        },
      };
      const result = await manager2.prepareCommand(req);
      expect(result.args).toEqual(['0', '/project', 'node', 'index.js']);
    });
  });

  describe('undefined config', () => {
    it('should use safe defaults when config is undefined', async () => {
      const manager3 = new WindowsSandboxManager('linux');
      const req: SandboxRequest = {
        command: 'pwd',
        args: [],
        cwd: '/some/path',
        env: { SECRET: 'value', PATH: '/usr/bin' },
        config: undefined,
      };
      const result = await manager3.prepareCommand(req);
      // network disabled by default
      expect(result.args[0]).toBe('0');
      // cwd and command present
      expect(result.args[1]).toBe('/some/path');
      expect(result.args[2]).toBe('pwd');
      // no extra args
      expect(result.args).toHaveLength(3);
    });
  });

  describe('empty args', () => {
    it('should produce exactly [networkFlag, cwd, command] when args is empty', async () => {
      const manager4 = new WindowsSandboxManager('linux');
      const req: SandboxRequest = {
        command: 'whoami',
        args: [],
        cwd: '/test',
        env: {},
        config: { networkAccess: false },
      };
      const result = await manager4.prepareCommand(req);
      expect(result.args).toHaveLength(3);
      expect(result.args).toEqual(['0', '/test', 'whoami']);
    });
  });
});
