/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import {
  ApprovalMode,
  coreEvents,
  debugLogger,
  processSingleFileContent,
  partToString,
  readFileWithEncoding,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import * as path from 'node:path';
import { copyToClipboard } from '../utils/commandUtils.js';

async function copyAction(context: CommandContext) {
  const config = context.services.config;
  if (!config) {
    debugLogger.debug('Plan copy command: config is not available in context');
    return;
  }

  const planPath = config.getApprovedPlanPath();

  if (!planPath) {
    coreEvents.emitFeedback('warning', 'No approved plan found to copy.');
    return;
  }

  try {
    const content = await readFileWithEncoding(planPath);
    await copyToClipboard(content);
    coreEvents.emitFeedback(
      'info',
      `Plan copied to clipboard (${path.basename(planPath)}).`,
    );
  } catch (error) {
    coreEvents.emitFeedback('error', `Failed to copy plan: ${error}`, error);
  }
}

export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'Switch to Plan Mode and view current plan',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context) => {
    const config = context.services.config;
    if (!config) {
      debugLogger.debug('Plan command: config is not available in context');
      return;
    }

    const previousApprovalMode = config.getApprovalMode();
    config.setApprovalMode(ApprovalMode.PLAN);

    if (previousApprovalMode !== ApprovalMode.PLAN) {
      coreEvents.emitFeedback('info', 'Switched to Plan Mode.');
    }

    const approvedPlanPath = config.getApprovedPlanPath();

    if (!approvedPlanPath) {
      return;
    }

    try {
      const content = await processSingleFileContent(
        approvedPlanPath,
        config.storage.getPlansDir(),
        config.getFileSystemService(),
      );
      const fileName = path.basename(approvedPlanPath);

      coreEvents.emitFeedback('info', `Approved Plan: ${fileName}`);

      context.ui.addItem({
        type: MessageType.GEMINI,
        text: partToString(content.llmContent),
      });
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Failed to read approved plan at ${approvedPlanPath}: ${error}`,
        error,
      );
    }
  },
  subCommands: [
    {
      name: 'copy',
      description: 'Copy the currently approved plan to your clipboard',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: copyAction,
    },
  ],
};
