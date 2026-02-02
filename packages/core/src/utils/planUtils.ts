/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isWithinRoot, getRealPathSync, isEmpty } from './fileUtils.js';

/**
 * Validates a plan file path for safety (traversal) and existence.
 * @param planPath The untrusted path to the plan file.
 * @param plansDir The authorized project plans directory.
 * @param targetDir The current working directory (project root).
 * @returns An error message if validation fails, or null if successful.
 */
export function validatePlanPath(
  planPath: string,
  plansDir: string,
  targetDir: string,
): string | null {
  const resolvedPath = path.resolve(targetDir, planPath);
  const realPath = getRealPathSync(resolvedPath);

  if (!isWithinRoot(realPath, plansDir)) {
    return 'Access denied: plan path must be within the designated plans directory.';
  }

  if (!fs.existsSync(resolvedPath)) {
    return `Plan file does not exist: ${planPath}. You must create the plan file before requesting approval.`;
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
      return 'Plan file is empty. You must write content to the plan file before requesting approval.';
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Failed to read plan file: ${message}`;
  }
}
