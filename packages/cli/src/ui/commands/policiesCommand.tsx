/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, PolicyRule } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';
import { PoliciesDialog } from '../components/PoliciesDialog.js';

function buildToolDisplayNames(
  rules: readonly PolicyRule[],
  config: Config,
): Map<string, string> {
  const toolDisplayNames = new Map<string, string>();
  const toolRegistry = config.getToolRegistry();
  for (const rule of rules) {
    if (rule.toolName && !toolDisplayNames.has(rule.toolName)) {
      const tool = toolRegistry.getTool(rule.toolName);
      if (tool) {
        toolDisplayNames.set(rule.toolName, tool.displayName);
      }
    }
  }
  return toolDisplayNames;
}

const policiesDialogAction: NonNullable<SlashCommand['action']> = async (
  context,
) => {
  const { agentContext } = context.services;
  const config = agentContext?.config;
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
  const allRules = policyEngine.getRules();

  // Filter out built-in default policies — users only care about rules they
  // (or their team / admin / extensions) configured.
  const rules = allRules.filter(
    (rule) => !rule.source?.startsWith('Default: '),
  );

  if (rules.length === 0) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'No custom policies configured.',
      },
      Date.now(),
    );
    return;
  }

  const toolDisplayNames = buildToolDisplayNames(rules, config);

  return {
    type: 'custom_dialog' as const,
    component: (
      <PoliciesDialog
        rules={rules}
        toolDisplayNames={toolDisplayNames}
        onClose={() => context.ui.removeComponent()}
      />
    ),
  };
};

const listPoliciesCommand: SlashCommand = {
  name: 'list',
  description: 'List all active policies grouped by mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: policiesDialogAction,
};

export const policiesCommand: SlashCommand = {
  name: 'policies',
  description: 'Manage policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: policiesDialogAction,
  subCommands: [listPoliciesCommand],
};
