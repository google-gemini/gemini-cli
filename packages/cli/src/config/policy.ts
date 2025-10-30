/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type PolicyEngineConfig,
  type ApprovalMode,
  type PolicyEngine,
  type MessageBus,
  type PolicySettings,
  createPolicyEngineConfig as createCorePolicyEngineConfig,
  createPolicyUpdater as createCorePolicyUpdater,
  getPolicyErrorsForUI as getCorePolicyErrorsForUI,
} from '@google/gemini-cli-core';
import { type Settings } from './settings.js';

export async function createPolicyEngineConfig(
  settings: Settings,
  approvalMode: ApprovalMode,
): Promise<PolicyEngineConfig> {
  // Explicitly construct PolicySettings from Settings to ensure type safety
  // and avoid accidental leakage of other settings properties.
  const policySettings: PolicySettings = {
    mcp: settings.mcp,
    tools: settings.tools,
    mcpServers: settings.mcpServers,
  };

  return createCorePolicyEngineConfig(policySettings, approvalMode);
}

export function createPolicyUpdater(
  policyEngine: PolicyEngine,
  messageBus: MessageBus,
) {
  return createCorePolicyUpdater(policyEngine, messageBus);
}

/**
 * Gets and clears any policy errors that were stored during config loading.
 * This should be called once the UI is ready to display errors.
 *
 * @returns Array of formatted error messages, or empty array if no errors
 */
export function getPolicyErrorsForUI(): string[] {
  return getCorePolicyErrorsForUI();
}