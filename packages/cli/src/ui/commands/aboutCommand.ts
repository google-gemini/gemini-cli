/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import process from 'node:process';
import { MessageType, type HistoryItemAbout } from '../types.js';
import {
  IdeClient,
  UserAccountManager,
  debugLogger,
  getVersion,
  getCodeAssistServer,
} from '@google/gemini-cli-core';

export const aboutCommand: SlashCommand = {
  name: 'about',
  description: 'Show version info',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
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
    const cliVersion = await getVersion();
    const selectedAuthType =
      context.services.settings.merged.security.auth.selectedType || '';
    const gcpProject = getGcpProject(context);
    const ideClient = await getIdeClientName(context);

    const userAccountManager = new UserAccountManager();
    const cachedAccount = userAccountManager.getCachedGoogleAccount();
    debugLogger.log('AboutCommand: Retrieved cached Google account', {
      cachedAccount,
    });
    const userEmail = cachedAccount ?? undefined;

    const tier = context.services.config?.getUserTierName();

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
      tier,
    };

    context.ui.addItem(aboutItem);
  },
};

/**
 * Resolves the GCP project ID.
 * Prefers the project ID from the Code Assist server (set during auth),
 * falling back to the GOOGLE_CLOUD_PROJECT environment variable.
 */
function getGcpProject(context: CommandContext): string {
  if (context.services.config) {
    const caServer = getCodeAssistServer(context.services.config);
    if (caServer?.projectId) {
      return caServer.projectId;
    }
  }
  return process.env['GOOGLE_CLOUD_PROJECT'] || '';
}

async function getIdeClientName(context: CommandContext) {
  if (!context.services.config?.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient?.getDetectedIdeDisplayName() ?? '';
}
