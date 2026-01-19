/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type EnvironmentSanitizationConfig = {
  allowedEnvironmentVariables: string[];
  blockedEnvironmentVariables: string[];
  enableEnvironmentVariableRedaction: boolean;
};

export function sanitizeEnvironment(
  processEnv: NodeJS.ProcessEnv,
  config: EnvironmentSanitizationConfig,
): NodeJS.ProcessEnv {
  // Enable strict sanitization in GitHub actions.
  const isStrictSanitization =
    !!processEnv['GITHUB_SHA'] || processEnv['SURFACE'] === 'Github';

  // Always sanitize when in GitHub actions.
  if (!config.enableEnvironmentVariableRedaction && !isStrictSanitization) {
    return { ...processEnv };
  }

  const results: NodeJS.ProcessEnv = {};

  const allowedSet = new Set(
    (config.allowedEnvironmentVariables || []).map((k) => k.toUpperCase()),
  );
  const blockedSet = new Set(
    (config.blockedEnvironmentVariables || []).map((k) => k.toUpperCase()),
  );

  for (const key in processEnv) {
    const value = processEnv[key];

    if (
      !shouldRedactEnvironmentVariable(
        key,
        value,
        allowedSet,
        blockedSet,
        isStrictSanitization,
      )
    ) {
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
  allowedSet?: Set<string>,
  blockedSet?: Set<string>,
  isStrictSanitization = false,
): boolean {
  key = key.toUpperCase();
  value = value?.toUpperCase();

  // User overrides take precedence.
  if (allowedSet?.has(key)) {
    return false;
  }
  if (blockedSet?.has(key)) {
    return true;
  }

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

  // If in strict mode (e.g. GitHub Action), and not explicitly allowed, redact it.
  if (isStrictSanitization) {
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
