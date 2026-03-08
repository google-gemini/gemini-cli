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
  debugLogger,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Settings } from './settings.js';

/**
 * Temporary flag to automatically accept workspace policies to reduce friction.
 * Exported as 'let' to allow monkey patching in tests via the setter.
 */
export let autoAcceptWorkspacePolicies = true;

/**
 * Sets the autoAcceptWorkspacePolicies flag.
 * Used primarily for testing purposes.
 */
export function setAutoAcceptWorkspacePolicies(value: boolean) {
  autoAcceptWorkspacePolicies = value;
}

/**
 * Temporary flag to disable workspace level policies altogether.
 * Exported as 'let' to allow monkey patching in tests via the setter.
 */
export let disableWorkspacePolicies = true;

/**
 * Sets the disableWorkspacePolicies flag.
 * Used primarily for testing purposes.
 */
export function setDisableWorkspacePolicies(value: boolean) {
  disableWorkspacePolicies = value;
}

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

const WORKSPACE_ROOT_MARKERS = ['.git', '.hg', '.svn'];

function findWorkspaceRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    for (const marker of WORKSPACE_ROOT_MARKERS) {
      if (fs.existsSync(path.join(currentDir, marker))) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }

    currentDir = parentDir;
  }
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
  const workspaceRoot = findWorkspaceRoot(cwd);

  let workspacePoliciesDir: string | undefined;
  let policyUpdateConfirmationRequest:
    | PolicyUpdateConfirmationRequest
    | undefined;

  if (trustedFolder && !disableWorkspacePolicies) {
    const storage = new Storage(workspaceRoot);

    // If we are in the home directory (or rather, our target Gemini dir is the global one),
    // don't treat it as a workspace to avoid loading global policies twice.
    if (storage.isWorkspaceHomeDir()) {
      return { workspacePoliciesDir: undefined };
    }

    const potentialWorkspacePoliciesDir = storage.getWorkspacePoliciesDir();
    const integrityManager = new PolicyIntegrityManager();
    const integrityResult = await integrityManager.checkIntegrity(
      'workspace',
      workspaceRoot,
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
    } else if (interactive && !autoAcceptWorkspacePolicies) {
      // Policies changed or are new, and we are in interactive mode and auto-accept is disabled
      policyUpdateConfirmationRequest = {
        scope: 'workspace',
        identifier: workspaceRoot,
        policyDir: potentialWorkspacePoliciesDir,
        newHash: integrityResult.hash,
      };
    } else {
      // Non-interactive mode or auto-accept is enabled: automatically accept/load
      await integrityManager.acceptIntegrity(
        'workspace',
        workspaceRoot,
        integrityResult.hash,
      );
      workspacePoliciesDir = potentialWorkspacePoliciesDir;

      if (!interactive) {
        writeToStderr(
          'WARNING: Workspace policies changed or are new. Automatically accepting and loading them.\n',
        );
      } else {
        debugLogger.warn(
          'Workspace policies changed or are new. Automatically accepting and loading them.',
        );
      }
    }
  }

  return { workspacePoliciesDir, policyUpdateConfirmationRequest };
}
