/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { homedir } from '@google/gemini-cli-core';

export function resolvePath(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = homedir() + p.substring('%userprofile%'.length);
  } else if (p === '~' || p.startsWith('~/')) {
    expandedPath = homedir() + p.substring(1);
  }
  try {
    return path.normalize(expandedPath);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENAMETOOLONG') {
      return expandedPath;
    }
    throw err;
  }
}
