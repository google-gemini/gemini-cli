/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MergedSettings } from './settings.js';

export const ALL_ITEMS = [
  {
    id: 'cwd',
    header: 'Path',
    description: 'Current directory path',
  },
  {
    id: 'git-branch',
    header: 'Branch',
    description: 'Current git branch name',
  },
  {
    id: 'sandbox-status',
    header: '/docs',
    description: 'Sandbox type and trust indicator',
  },
  {
    id: 'model-name',
    header: '/model',
    description: 'Current model identifier',
  },
  {
    id: 'context-remaining',
    header: 'Context',
    description: 'Percentage of context window remaining',
  },
  {
    id: 'quota',
    header: '/stats',
    description: 'Remaining usage on daily limit',
  },
  {
    id: 'memory-usage',
    header: 'Memory',
    description: 'Node.js heap memory usage',
  },
  {
    id: 'session-id',
    header: 'Session',
    description: 'Unique identifier for the current session',
  },
  {
    id: 'code-changes',
    header: 'Diff',
    description: 'Lines added/removed in the session',
  },
  {
    id: 'token-count',
    header: 'Tokens',
    description: 'Total tokens used in the session',
  },
] as const;

export type FooterItemId = (typeof ALL_ITEMS)[number]['id'];

export const DEFAULT_ORDER = [
  'cwd',
  'git-branch',
  'sandbox-status',
  'model-name',
  'context-remaining',
  'quota',
  'memory-usage',
  'session-id',
  'code-changes',
  'token-count',
];

export function deriveItemsFromLegacySettings(
  settings: MergedSettings,
): string[] {
  const defaults = [
    'cwd',
    'git-branch',
    'sandbox-status',
    'model-name',
    'quota',
  ];
  const items = [...defaults];

  const remove = (arr: string[], id: string) => {
    const idx = arr.indexOf(id);
    if (idx !== -1) arr.splice(idx, 1);
  };

  if (settings.ui.footer.hideCWD) remove(items, 'cwd');
  if (settings.ui.footer.hideSandboxStatus) remove(items, 'sandbox-status');
  if (settings.ui.footer.hideModelInfo) {
    remove(items, 'model-name');
    remove(items, 'context-remaining');
    remove(items, 'quota');
  }
  if (
    !settings.ui.footer.hideContextPercentage &&
    !items.includes('context-remaining')
  ) {
    const modelIdx = items.indexOf('model-name');
    if (modelIdx !== -1) items.splice(modelIdx + 1, 0, 'context-remaining');
    else items.push('context-remaining');
  }
  if (settings.ui.showMemoryUsage) items.push('memory-usage');

  return items;
}
