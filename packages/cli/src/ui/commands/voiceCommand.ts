/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElement } from 'react';
import type {
  SlashCommand,
  CommandContext,
  OpenCustomDialogActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import { VoiceMode } from '../components/VoiceMode.js';

/**
 * Opens the Voice Mode dialog as a custom component overlay.
 *
 * This is a proof-of-concept command that demonstrates the integration pattern
 * for voice mode into the Gemini CLI. The full implementation would:
 * - Initialize a VoiceService connected to the Gemini Live API
 * - Pass the service instance and tool declarations to the VoiceMode component
 * - Handle session lifecycle (connect, disconnect, error recovery)
 */
function voiceAction(
  context: CommandContext,
): MessageActionReturn | OpenCustomDialogActionReturn {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded. Cannot start voice mode.',
    };
  }

  return {
    type: 'custom_dialog',
    component: createElement(VoiceMode, {
      onClose: () => context.ui.removeComponent(),
    }),
  };
}

export const voiceCommand: SlashCommand = {
  name: 'voice',
  description: 'Start voice mode (proof-of-concept)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: voiceAction,
};
