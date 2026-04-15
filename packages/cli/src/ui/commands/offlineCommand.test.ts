/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineCommand } from './offlineCommand.js';
import { SettingScope } from '../../config/settings.js';
import type { CommandContext } from './types.js';

describe('offlineCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    const mockConfig = {
      isOfflineModeEnabled: vi.fn().mockReturnValue(true),
      getOfflineSettings: vi.fn().mockReturnValue({
        enabled: true,
        localModelRouting: 'stub_default_api',
      }),
      setOfflineMode: vi.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      services: {
        agentContext: {
          config: mockConfig,
        },
        settings: {
          setValue: vi.fn(),
        },
      },
    } as unknown as CommandContext;
  });

  it('shows offline mode status', async () => {
    if (!offlineCommand.action) {
      throw new Error('offline command must have an action');
    }
    const result = await offlineCommand.action(mockContext, '');

    expect(result).toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'info',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('Offline mode is enabled'),
      }),
    );
  });

  it('enables offline mode with /offline on', async () => {
    const onCommand = offlineCommand.subCommands?.find((c) => c.name === 'on');
    if (!onCommand?.action) {
      throw new Error('/offline on command must have an action');
    }

    const result = await onCommand.action(mockContext, '');

    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'general.offline.enabled',
      true,
    );
    expect(
      mockContext.services.agentContext?.config.setOfflineMode,
    ).toHaveBeenCalledWith(true);
    expect(result).toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'info',
        content: 'Offline mode enabled.',
      }),
    );
  });

  it('disables offline mode with /offline off', async () => {
    const offCommand = offlineCommand.subCommands?.find(
      (c) => c.name === 'off',
    );
    if (!offCommand?.action) {
      throw new Error('/offline off command must have an action');
    }

    const result = await offCommand.action(mockContext, '');

    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'general.offline.enabled',
      false,
    );
    expect(
      mockContext.services.agentContext?.config.setOfflineMode,
    ).toHaveBeenCalledWith(false);
    expect(result).toEqual(
      expect.objectContaining({
        type: 'message',
        messageType: 'info',
        content: 'Offline mode disabled.',
      }),
    );
  });
});
