/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCliVersion } from '../../utils/version.js';
import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import process from 'node:process';
import { MessageType, type HistoryItemAbout } from '../types.js';
import {
  IdeClient,
  AuthType,
  UserAccountManager,
  debugLogger,
} from '@google/gemini-cli-core';

function formatAuthLabel(authType: string): string {
  switch (authType) {
    case 'oauth-personal':
      return 'OAuth';
    case 'gemini-api-key':
      return 'Gemini API Key';
    case 'vertex-ai':
      return 'Vertex AI';
    default:
      return authType;
  }
}

function formatAuthDisplay(
  settingsAuthType: string,
  currentAuthType: AuthType | undefined,
  autoFallback: { enabled: boolean; type: 'gemini-api-key' | 'vertex-ai' },
): string {
  const parts: string[] = [];

  if (settingsAuthType) {
    parts.push(formatAuthLabel(settingsAuthType));
  }

  // If auto-fallback is enabled
  if (autoFallback.enabled) {
    const fallbackLabel = formatAuthLabel(autoFallback.type);
    parts.push(`(fallback: ${fallbackLabel})`);

    // Check if fallback is currently active in this session
    const fallbackAuthType =
      autoFallback.type === 'gemini-api-key'
        ? AuthType.USE_GEMINI
        : AuthType.USE_VERTEX_AI;
    if (currentAuthType === fallbackAuthType) {
      parts.push('\u2192 active this session');
    }
  } else if (
    settingsAuthType &&
    currentAuthType &&
    formatAuthLabel(settingsAuthType) !== formatAuthLabel(currentAuthType)
  ) {
    // Session auth differs without auto-fallback
    parts.push(`\u2192 session: ${formatAuthLabel(currentAuthType)}`);
  }

  return parts.join(' ');
}

export const aboutCommand: SlashCommand = {
  name: 'about',
  description: 'Show version info',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const osVersion = process.platform;
    let sandboxEnv = 'no sandbox';
    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      sandboxEnv = process.env['SANDBOX'];
    } else if (process.env['SANDBOX'] === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env['SEATBELT_PROFILE'] || 'unknown'
      })`;
    }
    const modelVersion = context.services.config?.getModel() || 'Unknown';
    const cliVersion = await getCliVersion();
    const mergedSettings = context.services.settings.merged;
    const settingsAuthType = mergedSettings.security?.auth?.selectedType || '';
    const config = context.services.config;
    const currentAuthType =
      config?.getContentGeneratorConfig()?.authType ?? undefined;
    const authSettings =
      (mergedSettings.security?.auth as
        | { autoFallback?: { enabled?: boolean; type?: string } }
        | undefined) ?? undefined;
    const settingsAutoFallback = authSettings?.autoFallback;
    const autoFallbackFromConfig = (
      config as unknown as {
        getAutoFallback?: () => {
          enabled: boolean;
          type: 'gemini-api-key' | 'vertex-ai';
        };
      }
    )?.getAutoFallback?.();
    const autoFallback = settingsAutoFallback
      ? {
          enabled: !!settingsAutoFallback.enabled,
          type: (settingsAutoFallback.type ?? 'gemini-api-key') as
            | 'gemini-api-key'
            | 'vertex-ai',
        }
      : (autoFallbackFromConfig ?? {
          enabled: false,
          type: 'gemini-api-key' as const,
        });
    const selectedAuthType = formatAuthDisplay(
      settingsAuthType,
      currentAuthType,
      autoFallback,
    );
    const gcpProject = process.env['GOOGLE_CLOUD_PROJECT'] || '';
    const ideClient = await getIdeClientName(context);

    const userAccountManager = new UserAccountManager();
    const cachedAccount = userAccountManager.getCachedGoogleAccount();
    debugLogger.log('AboutCommand: Retrieved cached Google account', {
      cachedAccount,
    });
    const userEmail = cachedAccount ?? undefined;

    const aboutItem: Omit<HistoryItemAbout, 'id'> = {
      type: MessageType.ABOUT,
      cliVersion,
      osVersion,
      sandboxEnv,
      modelVersion,
      selectedAuthType,
      gcpProject,
      ideClient,
      userEmail,
    };

    context.ui.addItem(aboutItem, Date.now());
  },
};

async function getIdeClientName(context: CommandContext) {
  if (!context.services.config?.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient?.getDetectedIdeDisplayName() ?? '';
}
