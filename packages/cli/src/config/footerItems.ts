/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MergedSettings } from './settings.js';

export const ALL_ITEMS = [
  {
    id: 'cwd',
    header: 'workspace (/directory)',
    description: 'Current working directory',
  },
  {
    id: 'git-branch',
    header: 'branch',
    description: 'Current git branch name (not shown when unavailable)',
  },
  {
    id: 'sandbox-status',
    header: 'sandbox',
    description: 'Sandbox type and trust indicator',
  },
  {
    id: 'model-name',
    header: '/model',
    description: 'Current model identifier',
  },
  {
    id: 'context-remaining',
    header: 'context',
    description: 'Percentage of context window remaining',
  },
  {
    id: 'usage-limit',
    header: '/stats',
    description: 'Remaining usage on daily limit (not shown when unavailable)',
  },
  {
    id: 'memory-usage',
    header: 'memory',
    description: 'Memory used by the application',
  },
  {
    id: 'session-id',
    header: 'session',
    description: 'Unique identifier for the current session',
  },
  {
    id: 'code-changes',
    header: 'diff',
    description: 'Lines added/removed in the session (not shown when zero)',
  },
  {
    id: 'token-count',
    header: 'tokens',
    description: 'Total tokens used in the session (not shown when zero)',
  },
] as const;

export type FooterItemId = (typeof ALL_ITEMS)[number]['id'];

export const DEFAULT_ORDER = [
  'cwd',
  'git-branch',
  'sandbox-status',
  'model-name',
  'context-remaining',
  'usage-limit',
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
    'usage-limit',
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
    remove(items, 'usage-limit');
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

const VALID_IDS: Set<string> = new Set(ALL_ITEMS.map((i) => i.id));

/**
 * Resolves the ordered list and selected set of footer items from settings.
 * Used by FooterConfigDialog to initialize and reset state.
 */
export function resolveFooterState(settings: MergedSettings): {
  orderedIds: string[];
  selectedIds: Set<string>;
} {
  const source = (
    settings.ui?.footer?.items ?? deriveItemsFromLegacySettings(settings)
  ).filter((id: string) => VALID_IDS.has(id));
  const others = DEFAULT_ORDER.filter((id) => !source.includes(id));
  return {
    orderedIds: [...source, ...others],
    selectedIds: new Set(source),
  };
}
