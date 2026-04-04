/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SandboxRequest } from '../../services/sandboxManager.js';
import {
  getCommandRoots,
  initializeShellParsers,
  splitCommands,
  stripShellWrapper,
} from '../../utils/shell-utils.js';
import { isKnownSafeCommand } from './commandSafety.js';
import { parse as shellParse } from 'shell-quote';
import path from 'node:path';

export async function isStrictlyApproved(
  req: SandboxRequest,
  approvedTools?: string[],
): Promise<boolean> {
  if (!approvedTools || approvedTools.length === 0) {
    return false;
  }

  await initializeShellParsers();

  const fullCmd = [req.command, ...req.args].join(' ');
  const stripped = stripShellWrapper(fullCmd);

  const roots = getCommandRoots(stripped);
  if (roots.length === 0) return false;

  const allRootsApproved = roots.every((root) => approvedTools.includes(root));
  if (allRootsApproved) {
    return true;
  }

  const pipelineCommands = splitCommands(stripped);
  if (pipelineCommands.length === 0) return false;

  for (const cmdString of pipelineCommands) {
    const parsedArgs = shellParse(cmdString).map(String);
    if (!isKnownSafeCommand(parsedArgs)) {
      return false;
    }
  }

  return true;
}

export async function getCommandName(req: SandboxRequest): Promise<string> {
  await initializeShellParsers();
  const fullCmd = [req.command, ...req.args].join(' ');
  const stripped = stripShellWrapper(fullCmd);
  const roots = getCommandRoots(stripped).filter(
    (r) => r !== 'shopt' && r !== 'set',
  );
  if (roots.length > 0) {
    return roots[0];
  }
  return path.basename(req.command);
}

export function verifySandboxOverrides(
  allowOverrides: boolean,
  policy: SandboxRequest['policy'],
) {
  if (!allowOverrides) {
    if (
      policy?.networkAccess ||
      policy?.allowedPaths?.length ||
      policy?.additionalPermissions?.network ||
      policy?.additionalPermissions?.fileSystem?.read?.length ||
      policy?.additionalPermissions?.fileSystem?.write?.length
    ) {
      throw new Error(
        'Sandbox request rejected: Cannot override readonly/network/filesystem restrictions in Plan mode.',
      );
    }
  }
}
