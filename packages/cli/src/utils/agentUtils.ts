/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../config/settings.js';
import type { AgentActionResult } from './agentSettings.js';

/**
 * Shared logic for building the core agent action message while allowing the
 * caller to control how each scope and its path are rendered (e.g., bolding or
 * dimming).
 *
 * This function ONLY returns the description of what happened. It is up to the
 * caller to append any interface-specific guidance.
 */
export function renderAgentActionFeedback(
  result: AgentActionResult,
  formatScope: (label: string, path: string) => string,
): string {
  const { agentName, action, status, error } = result;

  if (status === 'error') {
    return (
      error ||
      `An error occurred while attempting to ${action} agent "${agentName}".`
    );
  }

  if (status === 'no-op') {
    return `Agent "${agentName}" is already ${action === 'enable' ? 'enabled' : 'disabled'}.`;
  }

  const isEnable = action === 'enable';
  const actionVerb = isEnable ? 'enabled' : 'disabled';
  const preposition = isEnable
    ? 'by setting it to enabled in'
    : 'by setting it to disabled in';

  const formatScopeItem = (s: { scope: SettingScope; path: string }) => {
    const label =
      s.scope === SettingScope.Workspace ? 'project' : s.scope.toLowerCase();
    return formatScope(label, s.path);
  };

  const totalAffectedScopes = [
    ...result.modifiedScopes,
    ...result.alreadyInStateScopes,
  ];

  if (totalAffectedScopes.length === 2) {
    const s1 = formatScopeItem(totalAffectedScopes[0]);
    const s2 = formatScopeItem(totalAffectedScopes[1]);

    if (isEnable) {
      return `Agent "${agentName}" ${actionVerb} ${preposition} ${s1} and ${s2} settings.`;
    } else {
      return `Agent "${agentName}" is now disabled in both ${s1} and ${s2} settings.`;
    }
  }

  const s = formatScopeItem(totalAffectedScopes[0]);
  return `Agent "${agentName}" ${actionVerb} ${preposition} ${s} settings.`;
}
