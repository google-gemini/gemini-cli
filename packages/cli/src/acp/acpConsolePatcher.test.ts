/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from '../gemini.js';
import { loadCliConfig, parseArguments } from '../config/config.js';
import { loadSettings } from '../config/settings.js';
import { registerCleanup } from '../utils/cleanup.js';
import { ConsolePatcher } from '../ui/utils/ConsolePatcher.js';
import { createMockConfig } from '../test-utils/mockConfig.js';

vi.mock('../config/config.js');
vi.mock('../config/settings.js');
vi.mock('../utils/cleanup.js');
vi.mock('../ui/utils/ConsolePatcher.js');
vi.mock('../acp/acpClient.js', () => ({
  runAcpClient: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/sessionUtils.js', () => ({
  resolveSessionId: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
  SessionSelector: vi.fn(),
  SessionError: { noSessionsFound: vi.fn() },
}));

describe('ACP ConsolePatcher cleanup registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_CLI_NO_RELAUNCH', 'true');
    vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should not register ConsolePatcher cleanup in ACP mode', async () => {
    vi.mocked(parseArguments).mockResolvedValue({
      acp: true,
      query: undefined,
      model: undefined,
      sandbox: undefined,
      debug: undefined,
      prompt: undefined,
      promptInteractive: undefined,
      yolo: undefined,
      approvalMode: undefined,
      policy: undefined,
      adminPolicy: undefined,
      allowedMcpServerNames: undefined,
      allowedTools: [],
      extensions: undefined,
      listExtensions: undefined,
      resume: undefined,
      sessionId: undefined,
      listSessions: undefined,
      deleteSession: undefined,
      includeDirectories: undefined,
      screenReader: undefined,
      useWriteTodos: undefined,
      outputFormat: undefined,
      fakeResponses: undefined,
      recordResponses: undefined,
      rawOutput: undefined,
      acceptRawOutputRisk: undefined,
      skipTrust: undefined,
      isCommand: undefined,
      startupMessages: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const mockSettings = {
      merged: {
        tools: { allowed: [], exclude: [] },
        advanced: { dnsResolutionOrder: 'ipv4first' },
        security: { auth: { selectedType: 'google' } },
        ui: { theme: 'default' },
      },
      errors: [],
      workspace: { settings: {} },
      subscribe: vi.fn(),
      getSnapshot: vi.fn(),
      setValue: vi.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadSettings).mockReturnValue(mockSettings as any);
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        getAcpMode: () => true,
      }),
    );

    // Mock ConsolePatcher cleanup for reference check
    // We need to capture the exact function passed to registerCleanup
    let capturedCleanup: () => void;
    vi.mocked(ConsolePatcher).mockImplementation(() => {
      const instance = {
        patch: vi.fn(),
        cleanup: vi.fn(),
      };
      capturedCleanup = instance.cleanup;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return instance as any;
    });

    await main();

    // Verify registerCleanup was NOT called with our captured cleanup
    const registeredFunctions = vi
      .mocked(registerCleanup)
      .mock.calls.map((call) => call[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(registeredFunctions).not.toContain(capturedCleanup! as any);
  });

  it('should register ConsolePatcher cleanup in non-ACP mode', async () => {
    vi.mocked(parseArguments).mockResolvedValue({
      acp: false,
      query: 'test', // provide query to avoid "no input" error
      prompt: 'test',
      model: undefined,
      sandbox: undefined,
      debug: undefined,
      promptInteractive: undefined,
      yolo: undefined,
      approvalMode: undefined,
      policy: undefined,
      adminPolicy: undefined,
      allowedMcpServerNames: undefined,
      allowedTools: [],
      extensions: undefined,
      listExtensions: undefined,
      resume: undefined,
      sessionId: undefined,
      listSessions: undefined,
      deleteSession: undefined,
      includeDirectories: undefined,
      screenReader: undefined,
      useWriteTodos: undefined,
      outputFormat: undefined,
      fakeResponses: undefined,
      recordResponses: undefined,
      rawOutput: undefined,
      acceptRawOutputRisk: undefined,
      skipTrust: undefined,
      isCommand: undefined,
      startupMessages: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const mockSettings = {
      merged: {
        tools: { allowed: [], exclude: [] },
        advanced: { dnsResolutionOrder: 'ipv4first' },
        security: { auth: { selectedType: 'google' } },
        ui: { theme: 'default' },
      },
      errors: [],
      workspace: { settings: {} },
      subscribe: vi.fn(),
      getSnapshot: vi.fn(),
      setValue: vi.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadSettings).mockReturnValue(mockSettings as any);
    vi.mocked(loadCliConfig).mockResolvedValue(
      createMockConfig({
        getAcpMode: () => false,
        getQuestion: () => 'test',
      }),
    );

    let capturedCleanup: () => void;
    vi.mocked(ConsolePatcher).mockImplementation(() => {
      const instance = {
        patch: vi.fn(),
        cleanup: vi.fn(),
      };
      capturedCleanup = instance.cleanup;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return instance as any;
    });

    try {
      await main();
    } catch {
      // Ignore errors from incomplete mocks in full main() execution
    }

    // Verify registerCleanup WAS called with our captured cleanup
    const registeredFunctions = vi
      .mocked(registerCleanup)
      .mock.calls.map((call) => call[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(registeredFunctions).toContain(capturedCleanup! as any);
  });
});
