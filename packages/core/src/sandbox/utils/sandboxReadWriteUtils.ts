/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'node:path';
import {
  type SandboxPermissions,
  type SandboxRequest,
} from '../../services/sandboxManager.js';
import { isValidPathString } from '../../utils/paths.js';

/**
 * Validates if the requested paths are within the allowed workspace or allowed paths.
 */
function validatePaths(
  paths: string[],
  workspace: string,
  allowedPaths: string[],
): boolean {
  for (const p of paths) {
    if (!isValidPathString(p)) {
      return false; // Reject malicious paths
    }
    const resolvedPath = path.resolve(p);
    const resolvedWorkspace = path.resolve(workspace);
    const isInsideWorkspace =
      resolvedPath.startsWith(resolvedWorkspace + path.sep) ||
      resolvedPath === resolvedWorkspace;

    let isInsideAllowed = false;
    for (const allowed of allowedPaths) {
      const resolvedAllowed = path.resolve(allowed);
      if (
        resolvedPath.startsWith(resolvedAllowed + path.sep) ||
        resolvedPath === resolvedAllowed
      ) {
        isInsideAllowed = true;
        break;
      }
    }

    if (!isInsideWorkspace && !isInsideAllowed) {
      return false; // Path traversal or unauthorized access attempt
    }
  }
  return true;
}

export function handleReadWriteCommands(
  req: SandboxRequest,
  mergedAdditional: SandboxPermissions,
  workspace: string,
  allowedPaths: string[] = [],
): { command: string; args: string[] } {
  let finalCommand = req.command;
  let finalArgs = req.args;

  if (req.command === '__read') {
    finalCommand = '/bin/cat';
    if (req.args.length > 0) {
      if (validatePaths(req.args, workspace, allowedPaths)) {
        mergedAdditional.fileSystem!.read!.push(...req.args);
      } else {
        throw new Error(
          `Sandbox Error: Path traversal or unauthorized access attempt detected in __read: ${req.args.join(', ')}`,
        );
      }
    }
  } else if (req.command === '__write') {
    finalCommand = '/bin/sh';
    finalArgs = ['-c', 'tee -- "$@" > /dev/null', '_', ...req.args];
    if (req.args.length > 0) {
      if (validatePaths(req.args, workspace, allowedPaths)) {
        mergedAdditional.fileSystem!.write!.push(...req.args);
      } else {
        throw new Error(
          `Sandbox Error: Path traversal or unauthorized access attempt detected in __write: ${req.args.join(', ')}`,
        );
      }
    }
  }

  return { command: finalCommand, args: finalArgs };
}
