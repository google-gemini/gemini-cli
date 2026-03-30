/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../config/settings.js';
import type { HookActionResult } from './hookSettings.js';

/**
 * Shared logic for building the core hook action message while allowing the
 * caller to control how each scope and its path are rendered (e.g., bolding or
 * dimming).
 */
export function renderHookActionFeedback(
  result: HookActionResult,
  formatScope: (label: string, path: string) => string,
): string {
  const { hookName, action, status, error } = result;

  if (status === 'error') {
    return (
      error ||
      `An error occurred while attempting to ${action} hook "${hookName}".`
    );
  }

  if (status === 'no-op') {
    return `Hook "${hookName}" is already ${action === 'enable' ? 'enabled' : 'disabled'}.`;
  }

  const isEnable = action === 'enable';
  const actionVerb = isEnable ? 'enabled' : 'disabled';
  const preposition = isEnable
    ? 'by removing it from the disabled list in'
    : 'by adding it to the disabled list in';

  const formatScopeItem = (s: { scope: SettingScope; path: string }) => {
    const label =
      s.scope === SettingScope.Workspace ? 'workspace' : s.scope.toLowerCase();
    return formatScope(label, s.path);
  };

  const totalAffectedScopes = [
    ...result.modifiedScopes,
    ...result.alreadyInStateScopes,
  ];

  if (totalAffectedScopes.length === 0) {
    // This case should ideally not happen, but as a safeguard, return a generic message.
    return `Hook "${hookName}" ${actionVerb}.`;
  }

  if (totalAffectedScopes.length === 2) {
    const s1 = formatScopeItem(totalAffectedScopes[0]);
    const s2 = formatScopeItem(totalAffectedScopes[1]);

    if (isEnable) {
      return `Hook "${hookName}" ${actionVerb} ${preposition} ${s1} and ${s2} settings.`;
    } else {
      return `Hook "${hookName}" is now disabled in both ${s1} and ${s2} settings.`;
    }
  }

  const s = formatScopeItem(totalAffectedScopes[0]);
  return `Hook "${hookName}" ${actionVerb} ${preposition} ${s} settings.`;
}
