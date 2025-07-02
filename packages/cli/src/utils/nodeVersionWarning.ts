/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Utility to check Node.js version and return a warning if needed
export function getNodeVersionWarning(minMajor = 20): string | null {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < minMajor) {
    return `Warning: You are using Node.js v${process.versions.node}. Gemini CLI requires Node.js ${minMajor} or higher for best results.`;
  }
  return null;
}
