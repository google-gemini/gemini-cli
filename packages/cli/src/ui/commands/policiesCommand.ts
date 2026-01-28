/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode, type PolicyRule } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';
import { t } from '../../i18n/index.js';
import { MessageType } from '../types.js';

interface CategorizedRules {
  normal: PolicyRule[];
  autoEdit: PolicyRule[];
  yolo: PolicyRule[];
}

const categorizeRulesByMode = (
  rules: readonly PolicyRule[],
): CategorizedRules => {
  const result: CategorizedRules = {
    normal: [],
    autoEdit: [],
    yolo: [],
  };
  const ALL_MODES = Object.values(ApprovalMode);
  rules.forEach((rule) => {
    const modes = rule.modes?.length ? rule.modes : ALL_MODES;
    const modeSet = new Set(modes);
    if (modeSet.has(ApprovalMode.DEFAULT)) result.normal.push(rule);
    if (modeSet.has(ApprovalMode.AUTO_EDIT)) result.autoEdit.push(rule);
    if (modeSet.has(ApprovalMode.YOLO)) result.yolo.push(rule);
  });
  return result;
};

const formatRule = (rule: PolicyRule, i: number) => {
  let ruleText = `${i + 1}. **${rule.decision.toUpperCase()}** `;
  ruleText += rule.toolName
    ? t('commands:policies.responses.labels.tool', { name: rule.toolName })
    : t('commands:policies.responses.labels.allTools');

  if (rule.argsPattern) {
    ruleText += t('commands:policies.responses.labels.argsMatch', {
      pattern: rule.argsPattern.source,
    });
  }
  if (rule.priority !== undefined) {
    ruleText += t('commands:policies.responses.labels.priority', {
      priority: rule.priority,
    });
  }
  if (rule.source) {
    ruleText += t('commands:policies.responses.labels.source', {
      source: rule.source,
    });
  }
  return ruleText;
};

const formatSection = (title: string, rules: PolicyRule[]) =>
  `### ${title}\n${
    rules.length
      ? rules.map(formatRule).join('\n')
      : t('commands:policies.responses.noPoliciesLabel')
  }\n\n`;

const listPoliciesCommand: SlashCommand = {
  name: 'list',
  description: 'List all active policies grouped by mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { config } = context.services;
    if (!config) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: t('commands:policies.responses.configFailed'),
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
          text: t('commands:policies.responses.noPolicies'),
        },
        Date.now(),
      );
      return;
    }

    const categorized = categorizeRulesByMode(rules);
    const normalRulesSet = new Set(categorized.normal);
    const uniqueAutoEdit = categorized.autoEdit.filter(
      (rule) => !normalRulesSet.has(rule),
    );
    const uniqueYolo = categorized.yolo.filter(
      (rule) => !normalRulesSet.has(rule),
    );

    let content = t('commands:policies.responses.activePoliciesTitle');
    content += formatSection(
      t('commands:policies.responses.normalModeTitle'),
      categorized.normal,
    );
    content += formatSection(
      t('commands:policies.responses.autoEditModeTitle'),
      uniqueAutoEdit,
    );
    content += formatSection(
      t('commands:policies.responses.yoloModeTitle'),
      uniqueYolo,
    );

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: content,
      },
      Date.now(),
    );
  },
};

export const policiesCommand: SlashCommand = {
  name: 'policies',
  description: 'Manage policies',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listPoliciesCommand],
};
