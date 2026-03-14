/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import {
  MessageType,
  type HistoryItemVoiceHelp,
  type HistoryItemVoiceStatus,
} from '../types.js';
import { SettingScope } from '../../config/settings.js';

const voiceHelpCommand: SlashCommand = {
  name: 'help',
  description: 'Show all voice configuration commands and shortcuts',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const item: Omit<HistoryItemVoiceHelp, 'id'> = {
      type: MessageType.VOICE_HELP,
      timestamp: new Date(),
      text: 'Voice Input Help:\n- Space Space (on empty prompt): Start/Stop recording\n- Esc (while recording): Cancel\n- /voice: Show current settings',
    };
    context.ui.addItem(item);
  },
};

const voiceEnableCommand: SlashCommand = {
  // ... existing voiceEnableCommand ...
  name: 'enable',
  description: 'Enable voice input (double-tap Space on empty input to record)',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    context.services.settings.setValue(
      SettingScope.User,
      'voice.enabled',
      true,
    );
    return {
      type: 'message',
      messageType: MessageType.INFO,
      content:
        'Voice input enabled. Double-tap Space on an empty prompt to start recording.',
    };
  },
};

const voiceDisableCommand: SlashCommand = {
  // ... existing voiceDisableCommand ...
  name: 'disable',
  description: 'Disable voice input',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    context.services.settings.setValue(
      SettingScope.User,
      'voice.enabled',
      false,
    );
    return {
      type: 'message',
      messageType: MessageType.INFO,
      content: 'Voice input disabled.',
    };
  },
};

const voiceProviderCommand: SlashCommand = {
  // ... existing voiceProviderCommand ...
  name: 'provider',
  description: 'Set transcription backend: gemini (default) or whisper',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const provider = args?.trim().toLowerCase();
    if (provider !== 'gemini' && provider !== 'whisper') {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content: 'Usage: /voice provider [gemini|whisper]',
      };
    }
    context.services.settings.setValue(
      SettingScope.User,
      'voice.provider',
      provider,
    );
    return {
      type: 'message',
      messageType: MessageType.INFO,
      content: `Voice transcription backend set to: ${provider}`,
    };
  },
};

const voiceSensitivityCommand: SlashCommand = {
  // ... existing voiceSensitivityCommand ...
  name: 'sensitivity',
  description: 'Set silence threshold (0=off, 80=default, 300+=loud only)',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const raw = args?.trim();
    const value = raw !== undefined && raw !== '' ? Number(raw) : NaN;
    if (isNaN(value) || value < 0 || value > 1000) {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content:
          'Usage: /voice sensitivity <0-1000>\n' +
          '  0    = disable silence detection (captures all audio)\n' +
          '  1-80 = sensitive (whispered speech)\n' +
          '  80   = default\n' +
          '  300+ = only loud speech',
      };
    }
    context.services.settings.setValue(
      SettingScope.User,
      'voice.silenceThreshold',
      value,
    );
    const hint =
      value === 0
        ? 'Silence detection disabled.'
        : value <= 80
          ? 'Sensitive — whispered speech will be captured.'
          : value <= 200
            ? 'Moderate — quiet speech captured.'
            : 'High — only louder speech captured.';
    return {
      type: 'message',
      messageType: MessageType.INFO,
      content: `Voice sensitivity threshold set to ${value}. ${hint}`,
    };
  },
};

const voiceSetPathCommand: SlashCommand = {
  name: 'set-path',
  description: 'Set the path to the Whisper binary',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const path = args?.trim();
    if (!path) {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content: 'Usage: /voice set-path <path>',
      };
    }
    context.services.settings.setValue(
      SettingScope.User,
      'voice.whisperPath',
      path,
    );
    return {
      type: 'message',
      messageType: MessageType.INFO,
      content: `Whisper binary path set to: ${path}`,
    };
  },
};

export const voiceCommand: SlashCommand = {
  name: 'voice',
  description: 'Configure voice input settings',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    voiceHelpCommand,
    voiceEnableCommand,
    voiceDisableCommand,
    voiceProviderCommand,
    voiceSensitivityCommand,
    voiceSetPathCommand,
  ],
  action: async (context, args) => {
    const trimmedArgs = args?.trim() || '';
    if (trimmedArgs) {
      const parts = trimmedArgs.split(/\s+/);
      const subCommandName = parts[0]?.toLowerCase();
      const subCommandArgs = trimmedArgs.slice(parts[0].length).trim();

      const subCommand = voiceCommand.subCommands?.find(
        (sc) => sc.name === subCommandName,
      );
      if (subCommand?.action) {
        return subCommand.action(context, subCommandArgs);
      }
    }

    // Default: show current voice settings status
    const voiceSettings = context.services.settings.merged.voice ?? {};
    const enabled = voiceSettings.enabled ?? false;
    const provider = voiceSettings.provider ?? 'gemini';
    const whisperPath = voiceSettings.whisperPath ?? '(not set)';
    const threshold: number = voiceSettings.silenceThreshold ?? 80;
    const sensitivityLabel =
      threshold === 0
        ? 'disabled'
        : threshold <= 80
          ? `${threshold} (whisper-sensitive)`
          : threshold <= 300
            ? `${threshold} (moderate)`
            : `${threshold} (loud speech only)`;

    const statusText =
      `Voice Settings:\n` +
      `- Enabled: ${enabled}\n` +
      `- Provider: ${provider}\n` +
      `- Sensitivity: ${sensitivityLabel}\n` +
      `- Whisper Path: ${whisperPath}`;

    const statusItem: Omit<HistoryItemVoiceStatus, 'id'> = {
      type: MessageType.VOICE_STATUS,
      timestamp: new Date(),
      enabled,
      provider,
      sensitivityLabel,
      whisperPath,
      text: statusText,
    };
    context.ui.addItem(statusItem);
    return;
  },
};
