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
    // If the path is too long, it's likely a prompt, not a file.
  // Return it as is to avoid OS path length errors.
  if (expandedPath.length > 1024) {
    return expandedPath;
  }
  return path.normalize(expandedPath);
  
}
