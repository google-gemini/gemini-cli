/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { ApprovalMode, coreEvents, debugLogger } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import * as fs from 'node:fs';
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
    // Switch to plan mode
    config.setApprovalMode(ApprovalMode.PLAN);

    if (previousApprovalMode !== ApprovalMode.PLAN) {
      coreEvents.emitFeedback('info', 'Switched to Plan Mode.');
    }

    // Find and display the latest plan
    const approvedPlanPath = config.getApprovedPlanPath();

    if (!approvedPlanPath) {
      coreEvents.emitFeedback(
        'error',
        'No active plan found. Please create and approve a plan first.',
      );
      return;
    }

    try {
      const content = await fs.promises.readFile(approvedPlanPath, 'utf-8');
      const fileName = path.basename(approvedPlanPath);

      coreEvents.emitFeedback('info', `Active Plan: ${fileName}`);

      context.ui.addItem({
        type: MessageType.GEMINI,
        text: content,
      });
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Failed to read active plan at ${approvedPlanPath}: ${error}`,
        error,
      );
    }
  },
};
