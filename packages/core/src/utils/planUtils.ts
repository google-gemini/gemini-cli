/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { isEmpty, fileExists } from './fileUtils.js';
import { isSubpath, resolveToRealPath } from './paths.js';

/**
 * Standard error messages for the plan approval workflow.
 * Shared between backend tools and CLI UI for consistency.
 */
export const PlanErrorMessages = {
  PATH_ACCESS_DENIED:
    'Access denied: plan path must be within the designated plans directory.',
  FILE_NOT_FOUND: (path: string) =>
    `Plan file does not exist: ${path}. You must create the plan file before requesting approval.`,
  FILE_EMPTY:
    'Plan file is empty. You must write content to the plan file before requesting approval.',
  READ_FAILURE: (detail: string) => `Failed to read plan file: ${detail}`,
} as const;

/**
 * Validates a plan file path for safety (traversal) and existence.
 * @param planPath The untrusted path to the plan file.
 * @param plansDir The authorized project plans directory.
 * @param targetDir The current working directory (project root).
 * @returns An error message if validation fails, or null if successful.
 */
export async function validatePlanPath(
  planPath: string,
  plansDir: string,
  targetDir: string,
): Promise<string | null> {
  const resolvedPath = path.resolve(targetDir, planPath);
  const realPath = resolveToRealPath(resolvedPath);
  const realPlansDir = resolveToRealPath(plansDir);

  if (!isSubpath(realPlansDir, realPath)) {
    return PlanErrorMessages.PATH_ACCESS_DENIED;
  }

  if (!(await fileExists(resolvedPath))) {
    return PlanErrorMessages.FILE_NOT_FOUND(planPath);
  }

  return null;
}

/**
 * Validates that a plan file has non-empty content.
 * @param planPath The path to the plan file.
 * @returns An error message if the file is empty or unreadable, or null if successful.
 */
export async function validatePlanContent(
  planPath: string,
): Promise<string | null> {
  try {
    if (await isEmpty(planPath)) {
      return PlanErrorMessages.FILE_EMPTY;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return PlanErrorMessages.READ_FAILURE(message);
  }
}
