/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadMinimalCliConfig,
  type MinimalConfigParameters,
} from './config.js';
import { loadSettings } from './settings.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { ExtensionManager } from './extension-manager.js';

vi.mock('./settings.js');
vi.mock('./sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./policy.js', () => ({
  createPolicyEngineConfig: vi
    .fn()
    .mockResolvedValue({ nonInteractive: false }),
}));
vi.mock('./extension-manager.js');

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Config: vi.fn(),
    FileDiscoveryService: vi.fn(),
    resolveTelemetrySettings: vi.fn().mockResolvedValue({ enabled: true }),
    getPty: vi.fn().mockResolvedValue({ name: 'test-pty' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0-test'),
    loadServerHierarchicalMemory: vi.fn(),
    isHeadlessMode: vi.fn().mockReturnValue(false),
    setGeminiMdFilename: vi.fn(),
    getCurrentGeminiMdFilename: vi.fn().mockReturnValue('.gemini/GEMINI.md'),
    coreEvents: { emitConsoleLog: vi.fn(), emitFeedback: vi.fn() },
  };
});

describe('loadMinimalCliConfig', () => {
  const mockSettings = {
    merged: {
      security: { auth: { selectedType: 'test-auth', useExternal: false } },
      telemetry: { enabled: true },
      context: { importFormat: 'tree' },
      ui: { accessibility: { screenReader: false } },
      privacy: { usageStatisticsEnabled: true },
      experimental: {},
      tools: {},
      mcp: {},
      admin: {},
      hooksConfig: { enabled: false },
      skills: {},
    },
    setValue: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockArgv: any = {
    debug: false,
    prompt: undefined,
    promptInteractive: undefined,
    extensions: undefined,
    sandbox: undefined,
  };

  const sessionId = 'test-session-id';

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(loadSettings).mockReturnValue(mockSettings as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should produce a Config without initializing heavy services', async () => {
    const params: MinimalConfigParameters = { cwd: '/test/cwd' };

    await loadMinimalCliConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSettings.merged as any,
      sessionId,
      mockArgv,
      params,
    );

    expect(Config).toHaveBeenCalled();
    const configCallArgs = vi.mocked(Config).mock.calls[0][0];

    // Auth-critical fields should be set
    expect(configCallArgs.sessionId).toBe(sessionId);
    expect(configCallArgs.targetDir).toBe('/test/cwd');
    expect(configCallArgs.debugMode).toBe(false);

    // Heavy services must NOT be loaded
    expect(configCallArgs.fileDiscoveryService).toBeUndefined();
    expect(configCallArgs.extensionLoader).toBeUndefined();
    expect(configCallArgs.mcpServers).toEqual({});
    expect(configCallArgs.allowedTools).toBeUndefined();

    // Constructors should never have been called
    expect(FileDiscoveryService).not.toHaveBeenCalled();
    expect(ExtensionManager).not.toHaveBeenCalled();
  });

  it('should correctly detect interactive mode', async () => {
    const argvInteractive = { ...mockArgv, promptInteractive: 'hello' };
    await loadMinimalCliConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSettings.merged as any,
      sessionId,
      argvInteractive,
    );

    const configCallArgs = vi.mocked(Config).mock.calls[0][0];
    expect(configCallArgs.interactive).toBe(true);
  });

  it('should resolve telemetry settings', async () => {
    await loadMinimalCliConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSettings.merged as any,
      sessionId,
      mockArgv,
    );

    const configCallArgs = vi.mocked(Config).mock.calls[0][0];
    expect(configCallArgs.telemetry).toBeDefined();
  });
});
