/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { ShellTool } from './shell.js';
import { type Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import * as proactivePermissions from '../sandbox/utils/proactivePermissions.js';

import { initializeShellParsers } from '../utils/shell-utils.js';

vi.mock('../sandbox/utils/proactivePermissions.js', () => ({
  getProactiveToolSuggestions: vi.fn(),
  isNetworkReliantCommand: vi.fn(),
}));

describe('ShellTool Proactive Expansion', () => {
  let mockConfig: Config;
  let shellTool: ShellTool;

  beforeAll(async () => {
    await initializeShellParsers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      get config() {
        return this;
      },
      getSandboxEnabled: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue('/tmp'),
      getApprovalMode: vi.fn().mockReturnValue('strict'),
      sandboxPolicyManager: {
        getCommandPermissions: vi.fn().mockReturnValue({
          fileSystem: { read: [], write: [] },
          network: false,
        }),
        getModeConfig: vi.fn().mockReturnValue({ readonly: false }),
      },
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      getShellToolInactivityTimeout: vi.fn().mockReturnValue(1000),
    } as unknown as Config;

    const bus = createMockMessageBus();
    shellTool = new ShellTool(mockConfig, bus);
  });

  it('should NOT call getProactiveToolSuggestions when sandboxing is disabled', async () => {
    const invocation = shellTool.build({ command: 'npm install' });
    const abortSignal = new AbortController().signal;

    await invocation.shouldConfirmExecute(abortSignal);

    expect(
      proactivePermissions.getProactiveToolSuggestions,
    ).not.toHaveBeenCalled();
  });

  it('should call getProactiveToolSuggestions when sandboxing is enabled', async () => {
    vi.mocked(mockConfig.getSandboxEnabled).mockReturnValue(true);
    vi.mocked(
      proactivePermissions.getProactiveToolSuggestions,
    ).mockResolvedValue({
      network: true,
    });
    vi.mocked(proactivePermissions.isNetworkReliantCommand).mockReturnValue(
      true,
    );

    const invocation = shellTool.build({ command: 'npm install' });
    const abortSignal = new AbortController().signal;

    await invocation.shouldConfirmExecute(abortSignal);

    expect(
      proactivePermissions.getProactiveToolSuggestions,
    ).toHaveBeenCalledWith('npm');
  });

  it('should normalize command names (lowercase and strip .exe) when sandboxing is enabled', async () => {
    vi.mocked(mockConfig.getSandboxEnabled).mockReturnValue(true);
    vi.mocked(
      proactivePermissions.getProactiveToolSuggestions,
    ).mockResolvedValue({
      network: true,
    });
    vi.mocked(proactivePermissions.isNetworkReliantCommand).mockReturnValue(
      true,
    );

    const invocation = shellTool.build({ command: 'NPM.EXE install' });
    const abortSignal = new AbortController().signal;

    await invocation.shouldConfirmExecute(abortSignal);

    expect(
      proactivePermissions.getProactiveToolSuggestions,
    ).toHaveBeenCalledWith('npm');
  });
});
