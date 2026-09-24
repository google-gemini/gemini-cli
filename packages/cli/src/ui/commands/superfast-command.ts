/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { SettingScope } from '../../config/settings.js';
import { probeBackend } from '@google/gemini-cli-core';

/**
 * `/superfast [on|off|status]` — the user-facing switch for the optional
 * System One decision gate.
 *
 * The gate is off by default. Enabling it makes the harness ask a small local
 * decision model (Von) about each turn so it can skip expensive work on
 * obvious requests. It fails open: if the model is missing or unsure, the
 * harness behaves exactly as if the feature were off. The backend itself is
 * installed out-of-band with the `von-install` command.
 */
export const superfastCommand: SlashCommand = {
  name: 'superfast',
  description: 'Toggle the Superfast decision gate (local System One model)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  takesArgs: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const { settings } = context.services;
    const config = context.services.agentContext?.config;
    const sub = args.trim().toLowerCase();

    if (sub === 'on' || sub === 'off') {
      const enabled = sub === 'on';
      settings.setValue(SettingScope.User, 'superfast.enabled', enabled);
      return {
        type: 'message',
        messageType: 'info',
        content: enabled
          ? 'Superfast enabled. The decision gate will classify each turn and fail open if the model is unavailable.'
          : 'Superfast disabled. The harness runs normally.',
      };
    }

    if (sub && sub !== 'status') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /superfast <on|off|status>',
      };
    }

    // status
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not available.',
      };
    }
    const s = config.getSuperfastSettings();
    if (!s.enabled) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'Superfast is OFF. Run /superfast on to enable it (install the backend first with: gemini von-install).',
      };
    }
    const healthy = await probeBackend(s);
    return {
      type: 'message',
      messageType: healthy ? 'info' : 'error',
      content: healthy
        ? `Superfast is ON. Backend reachable at ${s.endpoint} (model ${s.model}).`
        : `Superfast is ON but the backend at ${s.endpoint} is not reachable. The gate fails open (normal behaviour). Start it with \`von serve\` or run gemini von-install.`,
    };
  },
};
