/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizePath } from '@google/gemini-cli-core';
import * as os from 'node:os';

export function resolvePath(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = os.homedir() + p.substring('%userprofile%'.length);
  } else if (p === '~' || p.startsWith('~/')) {
    expandedPath = os.homedir() + p.substring(1);
  }
  return normalizePath(expandedPath);
}
