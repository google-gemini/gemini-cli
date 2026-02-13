/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MergedSettings } from './settings.js';

export interface FooterItem {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const ALL_ITEMS: FooterItem[] = [
  {
    id: 'cwd',
    label: 'cwd',
    description: 'Current directory path',
    defaultEnabled: true,
  },
  {
    id: 'git-branch',
    label: 'git-branch',
    description: 'Current git branch name',
    defaultEnabled: true,
  },
  {
    id: 'sandbox-status',
    label: 'sandbox-status',
    description: 'Sandbox type and trust indicator',
    defaultEnabled: true,
  },
  {
    id: 'model-name',
    label: 'model-name',
    description: 'Current model identifier',
    defaultEnabled: true,
  },
  {
    id: 'context-remaining',
    label: 'context-remaining',
    description: 'Percentage of context window remaining',
    defaultEnabled: false,
  },
  {
    id: 'quota',
    label: 'quota',
    description: 'Remaining usage on daily limit',
    defaultEnabled: true,
  },
  {
    id: 'memory-usage',
    label: 'memory-usage',
    description: 'Node.js heap memory usage',
    defaultEnabled: false,
  },
  {
    id: 'session-id',
    label: 'session-id',
    description: 'Unique identifier for the current session',
    defaultEnabled: false,
  },
  {
    id: 'code-changes',
    label: 'code-changes',
    description: 'Lines added/removed in the session',
    defaultEnabled: true,
  },
  {
    id: 'token-count',
    label: 'token-count',
    description: 'Total tokens used in the session',
    defaultEnabled: false,
  },
];

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
