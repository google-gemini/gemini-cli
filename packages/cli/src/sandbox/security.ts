/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sandbox environment security utilities
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from '../utils/securityLogger.js';

// Environment variables considered safe for sandbox execution
const SAFE_ENV_VARS = new Set([
  'HOME',
  'USER',
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SHELL',
  'TERM',
  'TMPDIR',
  'TZ'
]);

// Environment variables that should be explicitly blocked
const BLOCKED_ENV_VARS = new Set([
  // Block any variables that could contain commands or scripts
  'PROMPT_COMMAND',
  'BASH_ENV',
  'ENV',
  // Block variables that might influence execution
  'LD_PRELOAD',
  'LD_LIBRARY_PATH'
]);

/**
 * Sanitizes environment variables for safe sandbox execution
 */
export function sanitizeSandboxEnvironment(
  env: Record<string, string | undefined>
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Block explicitly dangerous variables
    if (BLOCKED_ENV_VARS.has(key)) {
      blocked.push(key);
      securityLogger.log(
        SecurityEventType.ENVIRONMENT_SANITIZATION,
        SecuritySeverity.MEDIUM,
        `Blocked potentially unsafe environment variable`,
        { variable: key },
        'sandbox'
      );
      continue;
    }

    // Only allow explicitly safe variables
    if (SAFE_ENV_VARS.has(key)) {
      sanitized[key] = value;
      allowed.push(key);
    } else {
      // Log unknown variables for review
      securityLogger.log(
        SecurityEventType.ENVIRONMENT_SANITIZATION,
        SecuritySeverity.LOW,
        `Environment variable not in allow-list`,
        { variable: key },
        'sandbox'
      );
    }
  }

  // Log summary if any variables were blocked
  if (blocked.length > 0) {
    securityLogger.log(
      SecurityEventType.ENVIRONMENT_SANITIZATION,
      SecuritySeverity.HIGH,
      `Environment sanitization completed`,
      {
        blockedCount: blocked.length,
        allowedCount: allowed.length,
        blockedVars: blocked
      },
      'sandbox'
    );
  }

  return sanitized;
}

/**
 * Validates that environment setup is secure
 */
export function validateEnvironmentSecurity(env: Record<string, string | undefined>): boolean {
  let isSecure = true;

  for (const key of Object.keys(env)) {
    if (BLOCKED_ENV_VARS.has(key)) {
      securityLogger.log(
        SecurityEventType.ENVIRONMENT_SANITIZATION,
        SecuritySeverity.CRITICAL,
        `Dangerous environment variable detected`,
        { variable: key },
        'sandbox'
      );
      isSecure = false;
    }
  }

  return isSecure;
}

/**
 * Gets a secure default environment for sandbox execution
 */
export function getSecureSandboxEnvironment(): Record<string, string> {
  const baseEnv: Record<string, string> = {};

  // Copy safe environment variables from current process
  for (const varName of SAFE_ENV_VARS) {
    const value = process.env[varName];
    if (value) {
      baseEnv[varName] = value;
    }
  }

  // Set secure defaults
  baseEnv['TMPDIR'] = baseEnv['TMPDIR'] || '/tmp';
  baseEnv['PATH'] = baseEnv['PATH'] || '/usr/local/bin:/usr/bin:/bin';

  return baseEnv;
}
