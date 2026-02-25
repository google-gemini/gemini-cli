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
  PolicyIntegrityManager,
  IntegrityStatus,
  Storage,
  type PolicyUpdateConfirmationRequest,
  debugLogger,
} from '@google/gemini-cli-core';
import { type Settings } from './settings.js';

export async function createPolicyEngineConfig(
  settings: Settings,
  approvalMode: ApprovalMode,
  workspacePoliciesDir?: string,
): Promise<PolicyEngineConfig> {
  // Explicitly construct PolicySettings from Settings to ensure type safety
  // and avoid accidental leakage of other settings properties.
  const policySettings: PolicySettings = {
    mcp: settings.mcp,
    tools: settings.tools,
    mcpServers: settings.mcpServers,
    policyPaths: settings.policyPaths,
    workspacePoliciesDir,
  };

  return createCorePolicyEngineConfig(policySettings, approvalMode);
}

export function createPolicyUpdater(
  policyEngine: PolicyEngine,
  messageBus: MessageBus,
  storage: Storage,
) {
  return createCorePolicyUpdater(policyEngine, messageBus, storage);
}

export interface WorkspacePolicyState {
  workspacePoliciesDir?: string;
  policyUpdateConfirmationRequest?: PolicyUpdateConfirmationRequest;
}

/**
 * Resolves the workspace policy state by checking folder trust and policy integrity.
 */
export async function resolveWorkspacePolicyState(options: {
  cwd: string;
  trustedFolder: boolean;
}): Promise<WorkspacePolicyState> {
  const { cwd, trustedFolder } = options;

  let workspacePoliciesDir: string | undefined;
  // TODO: Restore policyUpdateConfirmationRequest when re-enabling interactive policy acceptance.
  const policyUpdateConfirmationRequest:
    | PolicyUpdateConfirmationRequest
    | undefined = undefined;

  if (trustedFolder) {
    const storage = new Storage(cwd);

    // If we are in the home directory (or rather, our target Gemini dir is the global one),
    // don't treat it as a workspace to avoid loading global policies twice.
    if (storage.isWorkspaceHomeDir()) {
      return { workspacePoliciesDir: undefined };
    }

    const potentialWorkspacePoliciesDir = storage.getWorkspacePoliciesDir();
    const integrityManager = new PolicyIntegrityManager();
    const integrityResult = await integrityManager.checkIntegrity(
      'workspace',
      cwd,
      potentialWorkspacePoliciesDir,
    );

    if (integrityResult.status === IntegrityStatus.MATCH) {
      workspacePoliciesDir = potentialWorkspacePoliciesDir;
    } else if (
      integrityResult.status === IntegrityStatus.NEW &&
      integrityResult.fileCount === 0
    ) {
      // No workspace policies found
      workspacePoliciesDir = undefined;
    } else {
      // Policies changed or are new.
      // Automatically accept and load for now to reduce friction.
      // We keep the infrastructure (PolicyUpdateConfirmationRequest etc.)
      // but bypass the interactive dialog.
      await integrityManager.acceptIntegrity(
        'workspace',
        cwd,
        integrityResult.hash,
      );
      workspacePoliciesDir = potentialWorkspacePoliciesDir;

      debugLogger.warn(
        'Workspace policies changed or are new. Automatically accepting and loading them.',
      );
    }
  }

  return { workspacePoliciesDir, policyUpdateConfirmationRequest };
}
