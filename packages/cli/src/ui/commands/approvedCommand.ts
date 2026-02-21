/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PolicyDecision, type PolicyRule } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

/**
 * Checks if a rule was dynamically added during the session via user approval.
 * These are rules added at the "session approval" priority tier (3.95).
 */
function isSessionApprovalRule(rule: PolicyRule): boolean {
  return (
    rule.decision === PolicyDecision.ALLOW &&
    rule.priority !== undefined &&
    rule.priority >= 3.94 &&
    rule.priority < 3.96
  );
}

/**
 * Formats a single approved rule for display.
 */
function formatApprovedRule(rule: PolicyRule, index: number): string {
  const toolPart = rule.toolName ? `\`${rule.toolName}\`` : 'all tools';
  let cmdPart = '';
  if (rule.argsPattern) {
    // Show a human-friendly version of the args pattern
    // The pattern looks like: "command":"deno(?:[\s"]|\\")
    // We strip surrounding regex syntax and show a friendlier form
    const match = rule.argsPattern.source.match(
      /"command":"([^"(?]+)(?:\(\?:.*\))?/,
    );
    cmdPart = match
      ? ` → command prefix \`${match[1]}\``
      : ` (args: \`${rule.argsPattern.source}\`)`;
  }
  const sourcePart = rule.source ? ` _(${rule.source})_` : '';
  return `${index + 1}. ${toolPart}${cmdPart}${sourcePart}`;
}

export const approvedCommand: SlashCommand = {
  name: 'approved',
  description:
    'Show commands and tools approved (Always Allow) during this session',
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

    const sessionApprovals = rules.filter(isSessionApprovalRule);

    if (sessionApprovals.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: "**Session Approvals**\n\nNo tools or commands have been approved with 'Always Allow' this session.\n\nTip: When prompted for tool approval, choose _Always Allow_ to add an entry here.",
        },
        Date.now(),
      );
      return;
    }

    const lines = sessionApprovals.map((rule, i) =>
      formatApprovedRule(rule, i),
    );

    const content = [
      `**Session Approvals** (${sessionApprovals.length} active)`,
      '',
      'These tools/commands will run without confirmation for the rest of this session:',
      '',
      ...lines,
      '',
      '_Use `/policies list` to see all active policy rules including persistent ones._',
    ].join('\n');

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: content,
      },
      Date.now(),
    );
  },
};
