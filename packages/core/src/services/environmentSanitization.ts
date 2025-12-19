/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This file implements a best effort secret redaction for use whenever
// configuring the environment for another process.
//
// Use the following guidance when updating the list to redact new secret
// types:
//
// - Try to update NEVER_ALLOWED_NAME_PATTERNS first so that we can keep
//   this set as minimal as possible. Take care not to add patterns that
//   are likely to redact non-secret variables.
//
// - Fallback to updating NEVER_ALLOWED_VALUE_PATTERNS for variables with
//   unassuming names but distinct credential patterns. Take care not to
//   add patterns that are too broad.
//
// - If all else fails, add the name to the never allowed or always allowed
//   list.
//
// If this file ends up being changed frequently or receives a lot of
// contributions we should consider replacing this with a user-driven
// feature that lets extensions declare the env vars they need and enables
// the user to accept/reject them.

export function sanitizeEnvironment(
  processEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const results: NodeJS.ProcessEnv = {};

  for (const key in processEnv) {
    const value = processEnv[key];

    if (!shouldRedactEnvironmentVariable(key, value)) {
      results[key] = value;
    }
  }

  return results;
}

export const ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES: ReadonlySet<string> =
  new Set([
    // Cross-platform
    'PATH',
    // Windows specific
    'SYSTEMROOT',
    'COMSPEC',
    'PATHEXT',
    'WINDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'SYSTEMDRIVE',
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
  ]);

export const NEVER_ALLOWED_ENVIRONMENT_VARIABLES: ReadonlySet<string> = new Set(
  [
    'CLIENT_ID',
    'DB_URI',
    'CONNECTION_STRING',
    'AWS_DEFAULT_REGION',
    'AZURE_CLIENT_ID',
    'AZURE_TENANT_ID',
    'SLACK_WEBHOOK_URL',
    'TWILIO_ACCOUNT_SID',
    'DATABASE_URL',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_ACCOUNT',
    'FIREBASE_PROJECT_ID',
  ],
);

export const NEVER_ALLOWED_NAME_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /KEY/i,
  /AUTH/i,
  /CREDENTIAL/i,
  /CREDS/i,
  /PRIVATE/i,
  /CERT/i,
] as const;

export const NEVER_ALLOWED_VALUE_PATTERNS = [
  /-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/i,
  /-----BEGIN CERTIFICATE-----/i,
  // Credentials in URL
  /(https?|ftp|smtp):\/\/[^:]+:[^@]+@/i,
  // GitHub tokens (classic, fine-grained, OAuth, etc.)
  /(ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,}/i,
  // Google API keys
  /AIzaSy[a-zA-Z0-9_\\-]{33}/i,
  // Amazon AWS Access Key ID
  /AKIA[A-Z0-9]{16}/i,
  // Generic OAuth/JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/i,
  // Stripe API keys
  /(s|r)k_(live|test)_[0-9a-zA-Z]{24}/i,
  // Slack tokens (bot, user, etc.)
  /xox[abpr]-[a-zA-Z0-9-]+/i,
] as const;

function shouldRedactEnvironmentVariable(
  key: string,
  value: string | undefined,
): boolean {
  key = key.toUpperCase();
  value = value?.toUpperCase();

  // These are never redacted.
  if (
    ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES.has(key) ||
    key.startsWith('GEMINI_CLI_')
  ) {
    return false;
  }

  // These are always redacted.
  if (NEVER_ALLOWED_ENVIRONMENT_VARIABLES.has(key)) {
    return true;
  }

  for (const pattern of NEVER_ALLOWED_NAME_PATTERNS) {
    if (pattern.test(key)) {
      return true;
    }
  }

  // Redact if the value looks like a key/cert.
  if (value) {
    for (const pattern of NEVER_ALLOWED_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        return true;
      }
    }
  }

  return false;
}
