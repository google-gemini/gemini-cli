/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { voiceCommand } from './voiceCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';

describe('voiceCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  it('enables voice input via /voice enable', async () => {
    if (!voiceCommand.action) {
      throw new Error('voice command has no action');
    }

    const result = await voiceCommand.action(mockContext, 'enable');

    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'voice.enabled',
      true,
    );
    expect(result).toEqual({
      type: 'message',
      messageType: MessageType.INFO,
      content:
        'Voice input enabled. Double-tap Space on an empty prompt to start recording.',
    });
  });

  it('switches to whisper via /voice provider whisper', async () => {
    if (!voiceCommand.action) {
      throw new Error('voice command has no action');
    }

    const result = await voiceCommand.action(mockContext, 'provider whisper');

    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'voice.provider',
      'whisper',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: MessageType.INFO,
      content: 'Voice transcription backend set to: whisper',
    });
  });

  it('sets whisper path correctly via /voice set-path including spaces', async () => {
    if (!voiceCommand.action) {
      throw new Error('voice command has no action');
    }

    const result = await voiceCommand.action(
      mockContext,
      'set-path C:\\Program Files\\whisper.exe',
    );

    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'voice.whisperPath',
      'C:\\Program Files\\whisper.exe',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: MessageType.INFO,
      content: 'Whisper binary path set to: C:\\Program Files\\whisper.exe',
    });
  });

  it('shows current voice status for bare /voice', async () => {
    if (!voiceCommand.action) {
      throw new Error('voice command has no action');
    }

    mockContext.services.settings.merged.voice = {
      enabled: true,
      provider: 'whisper',
      whisperPath: '/usr/local/bin/whisper',
      silenceThreshold: 0,
    } as never;

    await voiceCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.VOICE_STATUS,
        enabled: true,
        provider: 'whisper',
        sensitivityLabel: 'disabled',
        whisperPath: '/usr/local/bin/whisper',
        timestamp: expect.any(Date),
      }),
    );
  });
});
