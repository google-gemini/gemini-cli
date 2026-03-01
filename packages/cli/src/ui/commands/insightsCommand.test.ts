/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insightsCommand } from './insightsCommand.js';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';
import * as sessionUtils from '../../utils/sessionUtils.js';

vi.mock('../../utils/sessionUtils.js', () => ({
  getSessionFiles: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

function createMockContext(
  configOverrides?: Partial<CommandContext['services']['config']>,
): CommandContext {
  const addItem = vi.fn();
  return {
    services: {
      config: {
        storage: {
          getProjectTempDir: () => '/tmp/gemini-test',
        },
        getSessionId: () => 'test-session-id',
        getBaseLlmClient: () => ({
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Mock AI analysis' }],
                },
              },
            ],
          }),
        }),
        ...configOverrides,
      },
      settings: {} as CommandContext['services']['settings'],
      git: undefined,
      logger: {
        log: vi.fn(),
        error: vi.fn(),
      } as unknown as CommandContext['services']['logger'],
    },
    ui: {
      addItem,
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
      pendingItem: null,
      setPendingItem: vi.fn(),
      loadHistory: vi.fn(),
      toggleCorgiMode: vi.fn(),
      toggleDebugProfiler: vi.fn(),
      toggleVimEnabled: vi.fn(),
      reloadCommands: vi.fn(),
      openAgentConfigDialog: vi.fn(),
      extensionsUpdateState: new Map(),
      dispatchExtensionStateUpdate: vi.fn(),
      addConfirmUpdateExtensionRequest: vi.fn(),
      setConfirmationRequest: vi.fn(),
      removeComponent: vi.fn(),
      toggleBackgroundShell: vi.fn(),
      toggleShortcutsHelp: vi.fn(),
    },
    session: {
      stats: {
        sessionStartTime: new Date(),
      },
      sessionShellAllowlist: new Set<string>(),
    },
  } as unknown as CommandContext;
}

describe('insightsCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(insightsCommand.name).toBe('insights');
    expect(insightsCommand.autoExecute).toBe(true);
  });

  it('should show error when config is null', async () => {
    const context = createMockContext();
    // Set config to null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (context.services as any).config = null;

    await insightsCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Configuration is unavailable'),
      }),
    );
  });

  it('should show warning when no sessions are found', async () => {
    vi.mocked(sessionUtils.getSessionFiles).mockResolvedValue([]);
    const context = createMockContext();

    await insightsCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Analyzing'),
      }),
    );
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.WARNING,
        text: expect.stringContaining('No session history found'),
      }),
    );
  });
});
