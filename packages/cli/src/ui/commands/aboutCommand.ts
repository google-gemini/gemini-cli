/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import process from 'node:process';
import { MessageType, type HistoryItemAbout } from '../types.js';
import {
  IdeClient,
  UserAccountManager,
  debugLogger,
  getVersion,
} from '@google/gemini-cli-core';

export const aboutCommand: SlashCommand = {
  name: 'about',
  description: 'Show version info',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
 fix/about-email-redaction
  action: async (context, args) => {
    const showFull = args?.trim() === '--full';
    const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;


  isSafeConcurrent: true,
  action: async (context) => {
 main
    const osVersion = process.platform;
    let sandboxEnv = 'no sandbox';
    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      sandboxEnv = process.env['SANDBOX'];
    } else if (process.env['SANDBOX'] === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env['SEATBELT_PROFILE'] || 'unknown'
      })`;
    }
    const modelVersion =
      context.services.agentContext?.config.getModel() || 'Unknown';
    const cliVersion = await getVersion();
    const selectedAuthType =
      context.services.settings.merged.security.auth.selectedType || '';
    const gcpProject = process.env['GOOGLE_CLOUD_PROJECT'] || '';
    const ideClient = await getIdeClientName(context);

    const userAccountManager = new UserAccountManager();
    const cachedAccount = userAccountManager.getCachedGoogleAccount();
    debugLogger.log('AboutCommand: Retrieved cached Google account', {
      cachedAccount,
    });
    const rawUserEmail = cachedAccount ?? undefined;

    const tier = context.services.agentContext?.config.getUserTierName();

    // Determine email display and whether to show a warning.
    const emailDetected =
      rawUserEmail !== undefined && EMAIL_REGEX.test(rawUserEmail);
    const userEmail =
      emailDetected && !showFull ? '[email redacted]' : rawUserEmail;
    const showEmailWarning = emailDetected && !showFull;

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
      showEmailWarning,
    };

    context.ui.addItem(aboutItem);
  },
};

async function getIdeClientName(context: CommandContext) {
  if (!context.services.agentContext?.config.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient?.getDetectedIdeDisplayName() ?? '';
}
