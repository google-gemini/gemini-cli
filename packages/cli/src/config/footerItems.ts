/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MergedSettings } from './settings.js';

export const ALL_ITEMS = [
  {
    id: 'workspace',
    header: 'workspace (/directory)',
    description: 'Current working directory',
  },
  {
    id: 'git-branch',
    header: 'branch',
    description: 'Current git branch name (not shown when unavailable)',
  },
  {
    id: 'sandbox',
    header: 'sandbox',
    description: 'Sandbox type and trust indicator',
  },
  {
    id: 'model-name',
    header: '/model',
    description: 'Current model identifier',
  },
  {
    id: 'context-used',
    header: 'context',
    description: 'Percentage of context window used',
  },
  {
    id: 'quota',
    header: 'quota',
    description: 'Percentage of daily limit used (not shown when unavailable)',
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
    id: 'auth',
    header: '/auth',
    description: 'Current authentication info',
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
  'workspace',
  'git-branch',
  'sandbox',
  'model-name',
  'context-used',
  'quota',
  'memory-usage',
  'session-id',
  'auth',
  'code-changes',
  'token-count',
];

export function deriveItemsFromLegacySettings(
  settings: MergedSettings,
): string[] {
  const defaults = [
    'workspace',
    'git-branch',
    'sandbox',
    'model-name',
    'quota',
  ];
  const items = [...defaults];

  const remove = (arr: string[], id: string) => {
    const idx = arr.indexOf(id);
    if (idx !== -1) arr.splice(idx, 1);
  };

  if (settings.ui.footer.hideCWD) remove(items, 'workspace');
  if (settings.ui.footer.hideSandboxStatus) remove(items, 'sandbox');
  if (settings.ui.footer.hideModelInfo) {
    remove(items, 'model-name');
    remove(items, 'context-used');
    remove(items, 'quota');
  }
  if (
    !settings.ui.footer.hideContextPercentage &&
    !items.includes('context-used')
  ) {
    const modelIdx = items.indexOf('model-name');
    if (modelIdx !== -1) items.splice(modelIdx + 1, 0, 'context-used');
    else items.push('context-used');
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
  const showUserIdentity = settings.ui?.showUserIdentity !== false;
  const filteredValidIds = showUserIdentity
    ? VALID_IDS
    : new Set([...VALID_IDS].filter((id) => id !== 'auth'));

  const source = (
    settings.ui?.footer?.items ?? deriveItemsFromLegacySettings(settings)
  ).filter((id: string) => filteredValidIds.has(id));

  const others = DEFAULT_ORDER.filter(
    (id) => !source.includes(id) && filteredValidIds.has(id),
  );

  return {
    orderedIds: [...source, ...others],
    selectedIds: new Set(source),
  };
}
