/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { GOVERNANCE_FILES } from '../constants.js';
import { assertValidPathString } from '../../utils/paths.js';
import { isErrnoException } from './fsUtils.js';

/**
 * Ensures that governance files exist in the sandbox workspace.
 */
export function ensureGovernanceFilesExist(workspace: string): void {
  for (const file of GOVERNANCE_FILES) {
    const filePath = join(workspace, file.path);
    touch(filePath, file.isDirectory);
  }
}

/**
 * Helper to create a file or directory if it doesn't exist.
 */
export function touch(filePath: string, isDirectory: boolean): void {
  assertValidPathString(filePath);
  try {
    fs.lstatSync(filePath);
    return;
  } catch (e: unknown) {
    if (isErrnoException(e) && e.code !== 'ENOENT') {
      throw e;
    }
  }

  if (isDirectory) {
    fs.mkdirSync(filePath, { recursive: true });
  } else {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.closeSync(fs.openSync(filePath, 'a'));
  }
}
