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
  const isStrictSanitization =
    !!processEnv['GITHUB_SHA'] || processEnv['SURFACE'] === 'Github';

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
    // Terminal capability variables (needed by editors like vim/emacs and
    // interactive commands like top)
    'TERM',
    'COLORTERM',
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

/**
 * Additional value patterns for content-level redaction.
 * Covers common API key formats not already in NEVER_ALLOWED_VALUE_PATTERNS.
 */
const CONTENT_REDACTION_EXTRA_PATTERNS = [
  // OpenAI API keys (classic and project-scoped)
  /sk-(?:proj-[a-zA-Z0-9_-]{50,}|[a-zA-Z0-9]{32,})/,
  // Anthropic API keys
  /sk-ant-[a-zA-Z0-9_-]{80,}/,
] as const;

/**
 * Redacts sensitive credential values from arbitrary text content (e.g. shell
 * output, file reads) before the text is sent to the model or shown in the UI.
 *
 * This is distinct from {@link sanitizeEnvironment}, which filters env vars
 * *before* shell execution. This function scans tool output *after* execution
 * to prevent secrets from reaching the model or being persisted in session
 * history.
 *
 * Two strategies are applied:
 * 1. Pattern-match known token/key formats (GitHub, Google, AWS, JWT, Stripe,
 *    Slack, OpenAI, Anthropic, PEM blocks, credentialed URLs).
 * 2. Redact the value of any assignment whose left-hand side looks like a
 *    secret variable name (e.g. `OPENAI_API_KEY=…`, `export TOKEN=…`,
 *    `Environment="MISTRAL_KEY=…"`, `secret_key: "…"`).
 */
export function redactSensitiveContent(text: string): string {
  if (!text) return text;

  let result = text;

  // Strategy 1: Replace known secret value patterns inline.
  const allValuePatterns = [
    ...NEVER_ALLOWED_VALUE_PATTERNS,
    ...CONTENT_REDACTION_EXTRA_PATTERNS,
  ];
  for (const pattern of allValuePatterns) {
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );
    result = result.replace(globalPattern, '[REDACTED]');
  }

  // Strategy 2: Redact values assigned to variables with sensitive names.
  // Handles common formats found in shell output and config files:
  //   OPENAI_API_KEY=sk-abc123          (printenv / .env)
  //   export TOKEN=abc123               (shell export)
  //   Environment="MISTRAL_KEY=abc123"  (systemd service files)
  //   secret_key: abc123                (YAML)
  //   "api_key": "abc123"               (JSON)
  const sensitiveNameParts = NEVER_ALLOWED_NAME_PATTERNS.map(
    (p) => p.source,
  ).join('|');
  // Variable name must contain one of the sensitive words; value must be ≥6 chars.
  const assignmentRedactor = new RegExp(
    `\\b(\\w*(?:${sensitiveNameParts})\\w*)` + // variable name
      `(?:\\s*[=:]\\s*)` + // delimiter (= or :)
      `(?:"([^"\\n]{6,})"|'([^'\\n]{6,})'|([^\\s\\n"'<]{6,}))`, // value
    'gi',
  );
  result = result.replace(assignmentRedactor, '$1=[REDACTED]');

  return result;
}

function shouldRedactEnvironmentVariable(
  key: string,
  value: string | undefined,
  allowedSet?: Set<string>,
  blockedSet?: Set<string>,
  isStrictSanitization = false,
): boolean {
  key = key.toUpperCase();
  value = value?.toUpperCase();

  if (key.startsWith('GEMINI_CLI_')) {
    return false;
  }

  if (value) {
    for (const pattern of NEVER_ALLOWED_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        return true;
      }
    }
  }

  if (allowedSet?.has(key)) {
    return false;
  }
  if (blockedSet?.has(key)) {
    return true;
  }

  if (ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES.has(key)) {
    return false;
  }

  if (NEVER_ALLOWED_ENVIRONMENT_VARIABLES.has(key)) {
    return true;
  }

  if (isStrictSanitization) {
    return true;
  }

  for (const pattern of NEVER_ALLOWED_NAME_PATTERNS) {
    if (pattern.test(key)) {
      return true;
    }
  }

  return false;
}
