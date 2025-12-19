/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizeEnvironment(): NodeJS.ProcessEnv {
  const isRunningInGithub =
    process.env['GITHUB_SHA'] || process.env['SURFACE'] === 'Github';

  if (!isRunningInGithub) {
    // For local runs, we want to preserve the user's full environment.
    return { ...process.env };
  }

  // For CI runs (GitHub), we sanitize the environment for security.
  const env: Record<string, string> = {};
  const essentialVars = [
    // Cross-platform
    'PATH',
    // Windows specific
    'Path',
    'SYSTEMROOT',
    'SystemRoot',
    'COMSPEC',
    'ComSpec',
    'PATHEXT',
    'WINDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'SYSTEMDRIVE',
    'SystemDrive',
    // Unix/Linux/macOS specific
    'HOME',
    'LANG',
    'SHELL',
    'TMPDIR',
    'USER',
    'LOGNAME',
    // GitHub Action-related variables
    'ADDITIONAL_CONTEXT',
    'AVAILABLE_LABELS',
    'BRANCH_NAME',
    'DESCRIPTION',
    'EVENT_NAME',
    'GITHUB_ENV',
    'IS_PULL_REQUEST',
    'ISSUES_TO_TRIAGE',
    'ISSUE_BODY',
    'ISSUE_NUMBER',
    'ISSUE_TITLE',
    'PULL_REQUEST_NUMBER',
    'REPOSITORY',
    'TITLE',
    'TRIGGERING_ACTOR',
  ];

  for (const key of essentialVars) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  // Always carry over variables and secrets with GEMINI_CLI_*.
  for (const key in process.env) {
    if (key.startsWith('GEMINI_CLI_') && process.env[key]) {
      env[key] = process.env[key];
    }
  }

  return env;
}
