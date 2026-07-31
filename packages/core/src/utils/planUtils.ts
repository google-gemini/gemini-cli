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
  PATH_ACCESS_DENIED: (planPath: string, plansDir: string) =>
    `Access denied: plan path (${planPath}) must be within the designated plans directory (${plansDir}).`,
  FILE_NOT_FOUND: (path: string) =>
    `Plan file does not exist: ${path}. You must create the plan file before requesting approval.`,
  FILE_EMPTY:
    'Plan file is empty. You must write content to the plan file before requesting approval.',
  READ_FAILURE: (detail: string) => `Failed to read plan file: ${detail}`,
} as const;

/**
 * Resolves a plan file path and strictly validates it against the plans directory boundary.
 * Useful for tools that need to write or read plans.
 * @param planPath The untrusted file path provided by the model.
 * @param plansDir The authorized project plans directory.
 * @returns The safely resolved path string.
 * @throws Error if the path is empty, malicious, or escapes boundaries.
 */
export function resolveAndValidatePlanPath(
  planPath: string,
  plansDir: string,
  projectRoot: string,
): string {
  const trimmedPath = planPath.trim();
  if (!trimmedPath) {
    throw new Error('Plan file path must be non-empty.');
  }

  // 1. Handle case where agent provided an absolute path
  if (path.isAbsolute(trimmedPath)) {
    if (
      isSubpath(resolveToRealPath(plansDir), resolveToRealPath(trimmedPath))
    ) {
      return trimmedPath;
    }
  }

  // 2. Handle case where agent provided a path relative to the project root
  const resolvedFromProjectRoot = path.resolve(projectRoot, trimmedPath);
  if (
    isSubpath(
      resolveToRealPath(plansDir),
      resolveToRealPath(resolvedFromProjectRoot),
    )
  ) {
    return resolvedFromProjectRoot;
  }

  // 3. Handle default case where agent provided a path relative to the plans directory
  const resolvedPath = path.resolve(plansDir, trimmedPath);
  const realPath = resolveToRealPath(resolvedPath);
  const realPlansDir = resolveToRealPath(plansDir);

  if (!isSubpath(realPlansDir, realPath)) {
    throw new Error(
      PlanErrorMessages.PATH_ACCESS_DENIED(trimmedPath, plansDir),
    );
  }

  return resolvedPath;
}

/**
 * Validates a plan file path for safety (traversal) and existence.
 * @param planPath The untrusted path to the plan file.
 * @param plansDir The authorized project plans directory.
 * @param projectRoot The root directory of the project.
 * @returns An error message if validation fails, or null if successful.
 */
export async function validatePlanPath(
  planPath: string,
  plansDir: string,
  projectRoot: string,
): Promise<string | null> {
  try {
    const resolvedPath = resolveAndValidatePlanPath(
      planPath,
      plansDir,
      projectRoot,
    );
    if (!(await fileExists(resolvedPath))) {
      return PlanErrorMessages.FILE_NOT_FOUND(planPath);
    }
    return null;
  } catch {
    return PlanErrorMessages.PATH_ACCESS_DENIED(
      planPath,
      resolveToRealPath(plansDir),
    );
  }
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
