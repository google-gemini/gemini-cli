/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { debugLogger } from '@google/gemini-cli-core';

const mockManager = {
  enable: vi.fn(),
  disable: vi.fn(),
  disableForSession: vi.fn(),
  clearSessionDisable: vi.fn(),
};

const mockGetMcpServersFromConfig = vi.fn();
const mockLoadSettings = vi.fn();

vi.mock('./list.js', () => ({
  getMcpServersFromConfig: () => mockGetMcpServersFromConfig(),
}));

vi.mock('../../config/settings.js', () => ({
  loadSettings: () => mockLoadSettings(),
}));

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('../../config/mcp/mcpServerEnablement.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../config/mcp/mcpServerEnablement.js')
    >();
  return {
    ...actual,
    McpServerEnablementManager: {
      getInstance: () => mockManager,
    },
  };
});

const { enableCommand, disableCommand } = await import('./enableDisable.js');

/**
 * Everything the command wrote. Colour codes wrap the status word only, so the
 * message text itself is matchable as-is.
 */
function logged(spy: Mock): string {
  return spy.mock.calls.map((call) => String(call[0])).join('\n');
}

async function runEnable(name: string, session = false) {
  await enableCommand.handler({ name, session } as never);
}

async function runDisable(name: string, session = false) {
  await disableCommand.handler({ name, session } as never);
}

describe('mcp enable/disable server lookup', () => {
  let logSpy: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(debugLogger, 'log').mockImplementation(() => {}) as Mock;
    mockLoadSettings.mockReturnValue({ merged: {} });
    mockGetMcpServersFromConfig.mockResolvedValue({
      mcpServers: {
        playwright: { command: 'echo' },
        GitHub: { command: 'echo' },
      },
      blockedServerNames: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables a configured server instead of reporting it missing', async () => {
    await runEnable('playwright');

    expect(mockManager.enable).toHaveBeenCalledWith('playwright');
    expect(logged(logSpy)).not.toContain('not found');
    expect(logged(logSpy)).toContain("MCP server 'playwright' enabled.");
  });

  it('disables a configured server instead of reporting it missing', async () => {
    await runDisable('playwright');

    expect(mockManager.disable).toHaveBeenCalledWith('playwright');
    expect(logged(logSpy)).not.toContain('not found');
    expect(logged(logSpy)).toContain("MCP server 'playwright' disabled.");
  });

  it('matches server names case-insensitively', async () => {
    await runDisable('gIThUB');

    expect(mockManager.disable).toHaveBeenCalledWith('github');
  });

  it('does not treat the result wrapper fields as server names', async () => {
    await runEnable('mcpServers');

    expect(mockManager.enable).not.toHaveBeenCalled();
    expect(logged(logSpy)).toContain("Server 'mcpServers' not found");
  });

  it('still reports a genuinely unknown server as not found', async () => {
    await runEnable('nope');

    expect(mockManager.enable).not.toHaveBeenCalled();
    expect(logged(logSpy)).toContain("Server 'nope' not found");
  });

  it('points an admin-blocked server at the admin policy, not at a typo', async () => {
    mockGetMcpServersFromConfig.mockResolvedValue({
      mcpServers: {},
      // Mixed case on purpose: an all-lowercase fixture never exercises the
      // normalisation of blockedServerNames, so dropping it stayed green.
      blockedServerNames: ['PlayWright'],
    });

    await runEnable('playwright');

    expect(mockManager.enable).not.toHaveBeenCalled();
    const output = logged(logSpy);
    expect(output).not.toContain('not found');
    expect(output).toContain('not allowlisted by your administrator');
  });

  it('routes --session through the session state, not the file', async () => {
    await runEnable('playwright', true);
    await runDisable('playwright', true);

    expect(mockManager.clearSessionDisable).toHaveBeenCalledWith('playwright');
    expect(mockManager.disableForSession).toHaveBeenCalledWith('playwright');
    expect(mockManager.enable).not.toHaveBeenCalled();
    expect(mockManager.disable).not.toHaveBeenCalled();
  });

  it('refuses to enable a server blocked by the excluded list', async () => {
    mockLoadSettings.mockReturnValue({
      merged: { mcp: { excluded: ['playwright'] } },
    });

    await runEnable('playwright');

    expect(mockManager.enable).not.toHaveBeenCalled();
    expect(logged(logSpy)).toContain('mcp.excluded');
  });
});
