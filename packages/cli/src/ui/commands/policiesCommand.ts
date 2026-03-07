/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { ApprovalMode } from '@google/gemini-cli-core';

const listPoliciesCommand: SlashCommand = {
  name: 'list',
  description: 'List all active policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { config } = context.services;
    if (!config) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Error: Config not available.',
        },
        Date.now(),
      );
      return;
    }

    const policyEngine = config.getPolicyEngine();
    const rules = policyEngine.getRules();

    if (rules.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No active policies.',
        },
        Date.now(),
      );
      return;
    }

    let content = '**Active Policies**\n\n';
    rules.forEach((rule, index) => {
      content += `${index + 1}. **${rule.decision.toUpperCase()}**`;
      if (rule.toolName) {
        content += ` tool: \`${rule.toolName}\``;
      } else {
        content += ` all tools`;
      }
      if (rule.argsPattern) {
        content += ` (args match: \`${rule.argsPattern.source}\`)`;
      }
      if (rule.priority !== undefined) {
        content += ` [Priority: ${rule.priority}]`;
      }
      if (rule.source) {
        // Strip control characters to prevent terminal injection
        // eslint-disable-next-line no-control-regex
        const sanitizedSource = rule.source.replace(/[\x00-\x1F\x7F]/g, '');
        content += ` [Source: \`${sanitizedSource}\`]`;
      }
      content += '\n';
    });

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: content,
      },
      Date.now(),
    );
  },
};

const modeCommand: SlashCommand = {
  name: 'mode',
  description:
    'Set the tool approval mode (default, auto_edit, yolo, plan, headless)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { config } = context.services;
    if (!config) return;

    const modeStr = context.invocation?.args
      ?.trim()
      .split(/\s+/)[0]
      ?.toLowerCase();

    if (!modeStr) {
      const currentMode = config.getApprovalMode();
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Current approval mode: **${currentMode}**\nUse \`/policies mode [default|auto_edit|yolo|plan|headless]\` to change it.`,
        },
        Date.now(),
      );
      return;
    }

    let mode: ApprovalMode;
    let nonInteractive = false;

    switch (modeStr) {
      case 'default':
        mode = ApprovalMode.DEFAULT;
        nonInteractive = false;
        break;
      case 'auto_edit':
      case 'autoedit':
        mode = ApprovalMode.AUTO_EDIT;
        nonInteractive = false;
        break;
      case 'yolo':
        mode = ApprovalMode.YOLO;
        nonInteractive = true;
        break;
      case 'plan':
        mode = ApprovalMode.PLAN;
        nonInteractive = false;
        break;
      case 'headless':
        mode = ApprovalMode.HEADLESS;
        nonInteractive = true;
        break;
      default:
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: `Invalid approval mode: ${modeStr}. Valid modes: default, auto_edit, yolo, plan, headless.`,
          },
          Date.now(),
        );
        return;
    }

    try {
      config.setApprovalMode(mode);
      config.setNonInteractive(nonInteractive);
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Approval mode updated to: **${modeStr}**`,
        },
        Date.now(),
      );
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to set approval mode: ${error instanceof Error ? error.message : String(error)}`,
        },
        Date.now(),
      );
    }
  },
};

export const policiesCommand: SlashCommand = {
  name: 'policies',
  description: 'Manage policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listPoliciesCommand, modeCommand],
};
