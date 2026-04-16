/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AbstractOsSandboxManager,
  type PreparedExecutionDetails,
} from './abstractOsSandboxManager.js';

import type {
  SandboxRequest,
  ParsedSandboxDenial,
  SandboxedCommand,
  SandboxPermissions,
} from '../services/sandboxManager.js';
import type { ShellExecutionResult } from '../services/shellExecutionService.js';
import path from 'node:path';
import type { SandboxPolicyManager } from '../policy/sandboxPolicyManager.js';

/**
 * A minimal concrete subclass to test AbstractOsSandboxManager in isolation.
 * Overriding abstract methods avoids real OS dependencies and focuses on the
 * Template Method flow and environment preparation.
 */
class TestOsSandboxManager extends AbstractOsSandboxManager {
  isDangerousCommand(_args: string[]): boolean {
    return false;
  }
  parseDenials(_result: ShellExecutionResult): ParsedSandboxDenial | undefined {
    return undefined;
  }
  protected async buildSandboxedCommand(
    details: PreparedExecutionDetails,
  ): Promise<SandboxedCommand> {
    return {
      program: 'test',
      args: [details.networkAccess ? '1' : '0'],
      env: details.sanitizedEnv,
      cwd: details.req.cwd,
      cleanup: () => {},
    };
  }
  protected override isOsSafeCommand(_args: string[]): boolean {
    return false;
  }
  protected override async isStrictlyApproved(
    _command: string,
    _args: string[],
    _req: SandboxRequest,
  ): Promise<boolean> {
    return false;
  }
  protected override ensureGovernanceFilesExist(_workspace: string): void {}
  protected override async initialize(): Promise<void> {}
  protected override mapVirtualCommandToNative(
    command: string,
    args: string[],
  ) {
    return { command, args };
  }
  protected override updateReadWritePermissions() {}
  protected override rewriteReadWriteCommand(
    _req: SandboxRequest,
    command: string,
    args: string[],
    _permissions: SandboxPermissions,
  ) {
    return { command, args };
  }
  protected override isCaseInsensitive() {
    return false;
  }
}

describe('AbstractOsSandboxManager', () => {
  const workspace = path.resolve('/workspace');

  it('rejects overrides when allowOverrides is false', async () => {
    const customManager = new TestOsSandboxManager({
      workspace,
      modeConfig: { allowOverrides: false },
    });
    await expect(
      customManager.prepareCommand({
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: { networkAccess: true },
      }),
    ).rejects.toThrow(/Cannot override/);
  });

  it('should correctly pass through the cwd to the resulting command', async () => {
    const manager = new TestOsSandboxManager({ workspace });
    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: '/test/different/cwd',
      env: {},
    });

    expect(result.cwd).toBe('/test/different/cwd');
  });

  it('should apply environment sanitization via the default mechanisms', async () => {
    const manager = new TestOsSandboxManager({ workspace });
    const result = await manager.prepareCommand({
      command: 'echo',
      args: ['hello'],
      cwd: workspace,
      env: {
        SAFE_VAR: '1',
        GITHUB_TOKEN: 'sensitive',
      },
      policy: {
        sanitizationConfig: { enableEnvironmentVariableRedaction: true },
      },
    });

    expect(result.env['SAFE_VAR']).toBe('1');
    expect(result.env['GITHUB_TOKEN']).toBeUndefined();
  });

  it('should reject network access in Plan mode', async () => {
    const planManager = new TestOsSandboxManager({
      workspace,
      modeConfig: { readonly: true, allowOverrides: false },
    });
    const req: SandboxRequest = {
      command: 'curl',
      args: ['google.com'],
      cwd: workspace,
      env: {},
      policy: {
        additionalPermissions: { network: true },
      },
    };

    await expect(planManager.prepareCommand(req)).rejects.toThrow(
      'Sandbox request rejected: Cannot override readonly/network/filesystem restrictions in Plan mode.',
    );
  });

  it('should handle persistent permissions from policyManager', async () => {
    const persistentPath = path.join(workspace, 'persistent');
    const mockPolicyManager = {
      getCommandPermissions: vi.fn().mockReturnValue({
        fileSystem: { write: [persistentPath] },
        network: true,
      }),
    };

    const managerWithPolicy = new TestOsSandboxManager({
      workspace,
      modeConfig: { allowOverrides: true, network: false },
      policyManager: mockPolicyManager as unknown as SandboxPolicyManager,
    });

    const req: SandboxRequest = {
      command: 'test-cmd',
      args: [],
      cwd: workspace,
      env: {},
    };

    const result = await managerWithPolicy.prepareCommand(req);
    expect(result.args[0]).toBe('1'); // Network allowed by persistent policy
  });
});
