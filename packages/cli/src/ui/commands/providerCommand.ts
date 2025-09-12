/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, MessageActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { AuthType } from '@google/gemini-cli-core';
import { validateAuthMethod } from '../../config/auth.js';
import { SettingScope } from '../../config/settings.js';

function normalizeProvider(arg?: string): AuthType | null {
  if (!arg) return null;
  const val = arg.trim().toLowerCase();
  switch (val) {
    case 'google':
    case 'login':
    case 'oauth':
      return AuthType.LOGIN_WITH_GOOGLE;
    case 'cloudshell':
    case 'cloud-shell':
    case 'gcloud':
      return AuthType.CLOUD_SHELL;
    case 'gemini':
    case 'api':
    case 'api-key':
      return AuthType.USE_GEMINI;
    case 'vertex':
    case 'vertex-ai':
      return AuthType.USE_VERTEX_AI;
    case 'deepseek':
      return AuthType.USE_DEEPSEEK;
    default:
      return null;
  }
}

export const providerCommand: SlashCommand = {
  name: 'provider',
  altNames: ['auth-set', 'set-provider'],
  description:
    'Switch provider/auth. Usage: /provider <google|gemini|vertex|cloudshell|deepseek>',
  kind: CommandKind.BUILT_IN,
  async action(context, args): Promise<MessageActionReturn> {
    const { config, settings } = context.services;
    if (!config) {
      return { type: 'message', messageType: 'error', content: 'Config not initialized.' };
    }

    const desired = normalizeProvider(args);
    if (!desired) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Invalid provider. Use one of: google, gemini, vertex, cloudshell, deepseek',
      };
    }

    const validationError = validateAuthMethod(desired);
    if (validationError) {
      return { type: 'message', messageType: 'error', content: validationError };
    }

    try {
      // Persist selection
      settings.setValue(SettingScope.User, 'security.auth.selectedType', desired);
      // Apply immediately
      await config.refreshAuth(desired);

      return {
        type: 'message',
        messageType: 'info',
        content: `Provider switched to ${desired}.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { type: 'message', messageType: 'error', content: `Failed to switch provider: ${msg}` };
    }
  },
  async completion(_context, partialArg) {
    const options = ['google', 'gemini', 'vertex', 'cloudshell', 'deepseek'];
    return options.filter((o) => o.startsWith((partialArg || '').toLowerCase()));
  },
};

