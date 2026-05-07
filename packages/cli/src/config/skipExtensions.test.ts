/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCliConfig, type CliArgs } from './config.js';
import { ExtensionManager } from './extension-manager.js';
import { createTestMergedSettings } from './settings.js';

vi.mock('./extension-manager.js', () => ({
  ExtensionManager: vi.fn().mockImplementation(() => ({
    loadExtensions: vi.fn().mockResolvedValue([]),
    getExtensions: vi.fn().mockReturnValue([]),
  })),
}));

describe('loadCliConfig skipExtensions', () => {
  const settings = createTestMergedSettings();
  const argv = {
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
    allowedTools: undefined,
    extensions: undefined,
    listExtensions: undefined,
    resume: undefined,
    sessionId: undefined,
    listSessions: undefined,
  } as unknown as CliArgs;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load extensions by default', async () => {
    await loadCliConfig(settings, 'session-id', argv);
    expect(ExtensionManager).toHaveBeenCalled();
  });

  it('should skip extensions when skipExtensions is true', async () => {
    await loadCliConfig(settings, 'session-id', argv, { skipExtensions: true });
    expect(ExtensionManager).not.toHaveBeenCalled();
  });
});
