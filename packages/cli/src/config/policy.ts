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
  writeToStderr,
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
  interactive: boolean;
}): Promise<WorkspacePolicyState> {
  const { cwd, trustedFolder, interactive } = options;

  let workspacePoliciesDir: string | undefined;
  let policyUpdateConfirmationRequest:
    | PolicyUpdateConfirmationRequest
    | undefined;

  if (trustedFolder) {
    const potentialWorkspacePoliciesDir = new Storage(
      cwd,
    ).getWorkspacePoliciesDir();
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
    } else if (interactive) {
      // Policies changed or are new, and we are in interactive mode
      policyUpdateConfirmationRequest = {
        scope: 'workspace',
        identifier: cwd,
        policyDir: potentialWorkspacePoliciesDir,
        newHash: integrityResult.hash,
      };
    } else {
      // Non-interactive mode: warn and automatically accept/load
      await integrityManager.acceptIntegrity(
        'workspace',
        cwd,
        integrityResult.hash,
      );
      workspacePoliciesDir = potentialWorkspacePoliciesDir;
      // debugLogger.warn here doesn't show up in the terminal. It is showing up only in debug mode on the debug console
      writeToStderr(
        'WARNING: Workspace policies changed or are new. Automatically accepting and loading them in non-interactive mode.\n',
      );
    }
  }

  return { workspacePoliciesDir, policyUpdateConfirmationRequest };
}
