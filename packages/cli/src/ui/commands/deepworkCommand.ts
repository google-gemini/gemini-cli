/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { ApprovalMode, coreEvents, debugLogger } from '@google/gemini-cli-core';

export const deepworkCommand: SlashCommand = {
  name: 'deepwork',
  description: 'Switch to Deep Work mode for iterative execution',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.config;
    if (!config) {
      debugLogger.debug(
        'Deep Work command: config is not available in context',
      );
      return;
    }

    if (!config.isDeepWorkEnabled()) {
      coreEvents.emitFeedback(
        'error',
        'Deep Work mode is disabled. Enable experimental.deepWork in settings first.',
      );
      return;
    }

    const previousApprovalMode = config.getApprovalMode();
    config.setApprovalMode(ApprovalMode.DEEP_WORK);

    if (previousApprovalMode !== ApprovalMode.DEEP_WORK) {
      coreEvents.emitFeedback('info', 'Switched to Deep Work mode.');
    }

    const approvedPlanPath = config.getApprovedPlanPath();
    if (approvedPlanPath) {
      coreEvents.emitFeedback(
        'info',
        `Deep Work will follow approved plan: ${approvedPlanPath}`,
      );
    }
  },
};
