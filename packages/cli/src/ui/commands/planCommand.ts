/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import {
  ApprovalMode,
  coreEvents,
  debugLogger,
  processSingleFileContent,
  partToString,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import * as path from 'node:path';

export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'Switch to Plan Mode and view current plan',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
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
};
