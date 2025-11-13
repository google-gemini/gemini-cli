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
import { AuthType, IdeClient } from '@google/gemini-cli-core';

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
    const selectedAuthType = formatAuthDisplay(context);
    const gcpProject = process.env['GOOGLE_CLOUD_PROJECT'] || '';
    const ideClient = await getIdeClientName(context);

    const aboutItem: Omit<HistoryItemAbout, 'id'> = {
      type: MessageType.ABOUT,
      cliVersion,
      osVersion,
      sandboxEnv,
      modelVersion,
      selectedAuthType,
      gcpProject,
      ideClient,
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

function formatAuthDisplay(context: CommandContext): string {
  const settingsAuthType =
    context.services.settings.merged.security?.auth?.selectedType ?? '';
  const config = context.services.config;
  const currentAuthType =
    config?.getContentGeneratorConfig()?.authType ?? undefined;
  const autoFallback = config?.getAutoFallback();

  const parts: string[] = [];

  if (settingsAuthType) {
    parts.push(formatAuthLabel(settingsAuthType));
  }

  // Only show fallback info if persisted auth is OAuth (fallback system only applies to OAuth)
  if (
    autoFallback?.enabled &&
    settingsAuthType === AuthType.LOGIN_WITH_GOOGLE
  ) {
    const fallbackAuthType =
      autoFallback.type === 'gemini-api-key'
        ? AuthType.USE_GEMINI
        : AuthType.USE_VERTEX_AI;
    const fallbackLabel = formatAuthLabel(fallbackAuthType);
    const isActive = currentAuthType === fallbackAuthType;
    parts.push(
      `auto fallback → ${fallbackLabel}${isActive ? ' (active this session)' : ''}`,
    );
  } else if (
    currentAuthType &&
    currentAuthType !== settingsAuthType &&
    settingsAuthType
  ) {
    parts.push(`session → ${formatAuthLabel(currentAuthType)}`);
  }

  if (!parts.length) {
    return 'Not configured';
  }

  return parts.join(' | ');
}

function formatAuthLabel(authType: string | AuthType): string {
  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE:
      return 'OAuth';
    case AuthType.USE_GEMINI:
      return 'Gemini API Key';
    case AuthType.USE_VERTEX_AI:
      return 'Vertex AI';
    case AuthType.CLOUD_SHELL:
      return 'Cloud Shell';
    default:
      return authType;
  }
}
