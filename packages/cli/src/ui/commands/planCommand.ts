/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { ApprovalMode, coreEvents } from '@google/gemini-cli-core';
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
    if (!config) return;

    // Check if plan mode is enabled
    if (!config.isPlanEnabled()) {
      coreEvents.emitFeedback(
        'error',
        'Plan mode is experimental. Enable it in your settings (experimental.plan) to use this command.',
      );
      return;
    }

    // Switch to plan mode
    config.setApprovalMode(ApprovalMode.PLAN);
    coreEvents.emitFeedback('info', 'Switched to Plan Mode.');

    // Find and display the latest plan
    const plansDir = config.storage.getProjectTempPlansDir();

    try {
      if (!fs.existsSync(plansDir)) {
        coreEvents.emitFeedback('info', 'No plans found.');
        return;
      }

      const files = await fs.promises.readdir(plansDir);
      const planFiles = files.filter((f) => f.endsWith('.md'));

      if (planFiles.length === 0) {
        coreEvents.emitFeedback('info', 'No plans found.');
        return;
      }

      // Sort by modification time, newest first
      const sortedPlans = await Promise.all(
        planFiles.map(async (file) => {
          const filePath = path.join(plansDir, file);
          const stats = await fs.promises.stat(filePath);
          return { file, mtime: stats.mtimeMs, filePath };
        }),
      );

      sortedPlans.sort((a, b) => b.mtime - a.mtime);

      const latestPlan = sortedPlans[0];
      const content = await fs.promises.readFile(latestPlan.filePath, 'utf-8');

      coreEvents.emitFeedback('info', `Latest Plan: ${latestPlan.file}`);

      context.ui.addItem({
        type: MessageType.GEMINI,
        text: content,
      });
    } catch (error) {
      coreEvents.emitFeedback('error', `Failed to read plans: ${error}`, error);
    }
  },
};
