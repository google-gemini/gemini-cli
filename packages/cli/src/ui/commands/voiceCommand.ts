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
    };
    context.ui.addItem(item);
  },
};

const voiceEnableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable voice input (record with Alt+R or Ctrl+Q)',
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
      content: 'Voice input enabled. Press Alt+R or Ctrl+Q to start recording.',
    };
  },
};

const voiceDisableCommand: SlashCommand = {
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
  ],
  action: async (context, args) => {
    const trimmedArgs = args?.trim() || '';
    const parts = trimmedArgs.split(/\s+/);
    const subCommand = parts[0]?.toLowerCase();

    if (subCommand === 'enable') {
      return voiceEnableCommand.action!(context, parts.slice(1).join(' '));
    }

    if (subCommand === 'disable') {
      return voiceDisableCommand.action!(context, parts.slice(1).join(' '));
    }

    if (subCommand === 'provider') {
      return voiceProviderCommand.action!(context, parts.slice(1).join(' '));
    }

    if (subCommand === 'sensitivity') {
      return voiceSensitivityCommand.action!(context, parts.slice(1).join(' '));
    }

    // /voice set-path <path> — functional but not in autocomplete hints
    if (subCommand === 'set-path') {
      const path = parts[1];
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
    }

    if (subCommand === 'help') {
      return voiceHelpCommand.action!(context, '');
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

    const statusItem: Omit<HistoryItemVoiceStatus, 'id'> = {
      type: MessageType.VOICE_STATUS,
      timestamp: new Date(),
      enabled,
      provider,
      sensitivityLabel,
      whisperPath,
    };
    context.ui.addItem(statusItem);
    return;
  },
};
