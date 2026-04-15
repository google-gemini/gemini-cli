/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Files that represent the governance or "constitution" of the repository
 * and should be write-protected in any sandbox.
 */
export const GOVERNANCE_FILES = [
  { path: '.gitignore', isDirectory: false },
  { path: '.geminiignore', isDirectory: false },
  { path: '.git', isDirectory: true },
];

/**
 * Files that typically contain sensitive secrets or environment variables
 * and should be protected from unauthorized access or exfiltration.
 */
export const SECRET_FILES = [
  { pattern: '.env' },
  { pattern: '.env.*' },
] as const;
