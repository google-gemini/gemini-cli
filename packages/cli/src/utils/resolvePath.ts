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
  const isWindows = process.platform === 'win32';
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = homedir() + p.substring('%userprofile%'.length);
  } else if (
    p === '~' ||
    p.startsWith('~/') ||
    (isWindows && p.startsWith('~\\'))
  ) {
    expandedPath = homedir() + p.substring(1);
  }
  return (isWindows ? path.win32 : path.posix).normalize(expandedPath);
}
