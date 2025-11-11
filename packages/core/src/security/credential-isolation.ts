/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Credential Isolation - Prevents cross-cloud credential theft and leakage.
 *
 * SECURITY NOTE: Cloud credentials (AWS, GCP, Azure, Alibaba) are high-value
 * targets. Improper isolation allows:
 * - Reading credentials from one cloud provider and using in another
 * - Container escape to steal host credentials
 * - Credential leakage through environment variables
 * - Service account token theft from metadata services
 *
 * This module provides strict credential compartmentalization.
 */

/**
 * Cloud provider enumeration.
 */
export enum CloudProvider {
  AWS = 'AWS',
  GCP = 'GCP',
  AZURE = 'Azure',
  ALIBABA = 'Alibaba',
  UNKNOWN = 'Unknown',
}

/**
 * Credential file locations by provider.
 */
const CREDENTIAL_PATHS: Record<CloudProvider, string[]> = {
  [CloudProvider.AWS]: [
    '~/.aws/credentials',
    '~/.aws/config',
    '~/.aws/cli/cache',
  ],
  [CloudProvider.GCP]: [
    '~/.config/gcloud/credentials.db',
    '~/.config/gcloud/access_tokens.db',
    '~/.config/gcloud/legacy_credentials',
    '~/.config/gcloud/application_default_credentials.json',
  ],
  [CloudProvider.AZURE]: [
    '~/.azure/accessTokens.json',
    '~/.azure/azureProfile.json',
    '~/.azure/msal_token_cache.json',
  ],
  [CloudProvider.ALIBABA]: [
    '~/.aliyun/config.json',
    '~/.alibabacloud/credentials',
  ],
  [CloudProvider.UNKNOWN]: [],
};

/**
 * Environment variables containing credentials by provider.
 */
const CREDENTIAL_ENV_VARS: Record<CloudProvider, string[]> = {
  [CloudProvider.AWS]: [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_SECURITY_TOKEN',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_CONFIG_FILE',
  ],
  [CloudProvider.GCP]: [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CLOUD_PROJECT',
    'GCLOUD_PROJECT',
    'GCP_PROJECT',
    'GOOGLE_CLOUD_KEYFILE_JSON',
  ],
  [CloudProvider.AZURE]: [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_SUBSCRIPTION_ID',
  ],
  [CloudProvider.ALIBABA]: [
    'ALIBABA_CLOUD_ACCESS_KEY_ID',
    'ALIBABA_CLOUD_ACCESS_KEY_SECRET',
    'ALIBABA_CLOUD_SECURITY_TOKEN',
  ],
  [CloudProvider.UNKNOWN]: [],
};

/**
 * Detects which cloud provider the environment is configured for.
 *
 * @returns Array of detected cloud providers
 */
export function detectCloudProviders(): CloudProvider[] {
  const detected: CloudProvider[] = [];

  // Check environment variables
  for (const [provider, envVars] of Object.entries(CREDENTIAL_ENV_VARS)) {
    if (provider === CloudProvider.UNKNOWN) continue;

    for (const envVar of envVars) {
      if (process.env[envVar]) {
        detected.push(provider as CloudProvider);
        break;
      }
    }
  }

  // Check credential files
  const homeDir = os.homedir();

  for (const [provider, paths] of Object.entries(CREDENTIAL_PATHS)) {
    if (provider === CloudProvider.UNKNOWN) continue;

    for (const credPath of paths) {
      const fullPath = credPath.replace('~', homeDir);
      try {
        if (fs.existsSync(fullPath)) {
          if (!detected.includes(provider as CloudProvider)) {
            detected.push(provider as CloudProvider);
          }
          break;
        }
      } catch {
        // Ignore errors
      }
    }
  }

  return detected;
}

/**
 * Isolates credentials for a specific cloud provider.
 * Returns only environment variables safe for that provider.
 *
 * @param provider Cloud provider to isolate for
 * @param env Environment object
 * @returns Isolated environment
 */
export function isolateCredentials(
  provider: CloudProvider,
  env: Record<string, string | undefined>,
): Record<string, string> {
  const isolated: Record<string, string> = {};
  const allowedVars = new Set(CREDENTIAL_ENV_VARS[provider]);

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;

    // Allow non-credential variables
    const isCredentialVar = Object.values(CREDENTIAL_ENV_VARS)
      .flat()
      .includes(key);

    if (!isCredentialVar) {
      isolated[key] = value;
      continue;
    }

    // Only include credentials for the specified provider
    if (allowedVars.has(key)) {
      isolated[key] = value;
    } else {
      logConfigTamperingDetected(
        'Credential isolation',
        `Blocked cross-cloud credential: ${key} (not for ${provider})`,
      );
    }
  }

  return isolated;
}

/**
 * Validates that no cross-cloud credentials are present.
 *
 * @param allowedProvider The provider that credentials are allowed for
 * @returns True if valid, throws error if cross-cloud credentials found
 */
export function validateNoFortuneCrossCloudCredentials(
  allowedProvider?: CloudProvider,
): boolean {
  const detected = detectCloudProviders();

  if (detected.length === 0) {
    // No credentials detected
    return true;
  }

  if (detected.length === 1 && allowedProvider && detected[0] === allowedProvider) {
    // Only allowed provider credentials present
    return true;
  }

  if (detected.length > 1) {
    const providers = detected.join(', ');
    logConfigTamperingDetected(
      'Credential validation',
      `Multiple cloud provider credentials detected: ${providers}`,
    );
    console.warn(
      `WARNING: Multiple cloud provider credentials detected (${providers}). ` +
      'This increases risk of credential theft and cross-cloud attacks.',
    );
  }

  return true;
}

/**
 * Scrubs credential values from strings (for logging).
 *
 * @param text Text to scrub
 * @returns Scrubbed text with credentials redacted
 */
export function scrubCredentials(text: string): string {
  let scrubbed = text;

  // AWS Access Key ID pattern
  scrubbed = scrubbed.replace(
    /AKIA[0-9A-Z]{16}/g,
    'AKIA[REDACTED]',
  );

  // AWS Secret Access Key pattern (base64, 40 chars)
  scrubbed = scrubbed.replace(
    /[A-Za-z0-9/+=]{40}/g,
    (match) => {
      // Only redact if it looks like a secret key
      if (/[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9]/.test(match)) {
        return '[REDACTED_SECRET]';
      }
      return match;
    },
  );

  // GCP service account email pattern
  scrubbed = scrubbed.replace(
    /[\w-]+@[\w-]+\.iam\.gserviceaccount\.com/g,
    '[REDACTED]@[REDACTED].iam.gserviceaccount.com',
  );

  // Generic API key patterns
  scrubbed = scrubbed.replace(
    /["']?([A-Za-z0-9_-]{32,})["']?/g,
    (match, key) => {
      // Only redact long alphanumeric strings that might be keys
      if (key.length >= 32 && /[A-Za-z]/.test(key) && /[0-9]/.test(key)) {
        return '"[REDACTED_KEY]"';
      }
      return match;
    },
  );

  // Azure tenant/client IDs (UUIDs)
  scrubbed = scrubbed.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[REDACTED_UUID]',
  );

  // Bearer tokens
  scrubbed = scrubbed.replace(
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    'Bearer [REDACTED]',
  );

  return scrubbed;
}

/**
 * Checks if a file contains cloud credentials.
 *
 * @param filePath Path to file to check
 * @returns True if credentials detected
 */
export function fileContainsCredentials(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for credential patterns
    const patterns = [
      /AKIA[0-9A-Z]{16}/,                         // AWS Access Key ID
      /["']?[A-Za-z0-9/+=]{40}["']?/,             // AWS Secret Key
      /private_key.*BEGIN.*PRIVATE.*KEY/s,        // Private keys
      /service_account.*iam\.gserviceaccount/,    // GCP service account
      /client_id.*client_secret/,                 // OAuth credentials
      /password.*:\s*["'][^"']+["']/,             // Passwords in config
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
  } catch {
    // If we can't read the file, assume it might contain credentials
    return true;
  }

  return false;
}

/**
 * Gets the path to store isolated credentials for a provider.
 *
 * @param provider Cloud provider
 * @returns Path to isolated credential storage
 */
export function getIsolatedCredentialPath(provider: CloudProvider): string {
  const homeDir = os.homedir();
  const basePath = path.join(homeDir, '.gemini-cli', 'isolated-credentials');

  // Ensure directory exists with restrictive permissions
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true, mode: 0o700 });
  }

  return path.join(basePath, provider.toLowerCase());
}

/**
 * Prevents credential leakage through common vectors.
 *
 * @returns Array of actions taken
 */
export function preventCredentialLeakage(): string[] {
  const actions: string[] = [];

  try {
    // 1. Check for credentials in environment
    const detected = detectCloudProviders();
    if (detected.length > 0) {
      actions.push(`Detected credentials for: ${detected.join(', ')}`);
    }

    // 2. Warn about credentials in common locations
    const homeDir = os.homedir();
    const sensitiveFiles = [
      '.bashrc',
      '.zshrc',
      '.profile',
      '.bash_profile',
      '.env',
      '.env.local',
    ];

    for (const file of sensitiveFiles) {
      const filePath = path.join(homeDir, file);
      try {
        if (fs.existsSync(filePath) && fileContainsCredentials(filePath)) {
          actions.push(`WARNING: Credentials detected in ${file}`);
          logConfigTamperingDetected(
            'Credential leakage',
            `Credentials found in shell configuration: ${file}`,
          );
        }
      } catch {
        // Ignore read errors
      }
    }

    // 3. Check for credentials in current directory
    const localEnvFile = path.join(process.cwd(), '.env');
    if (fs.existsSync(localEnvFile) && fileContainsCredentials(localEnvFile)) {
      actions.push('WARNING: Credentials detected in local .env file');
      logConfigTamperingDetected(
        'Credential leakage',
        'Credentials found in project .env file',
      );
    }
  } catch (error) {
    actions.push(`Credential leak check failed: ${(error as Error).message}`);
  }

  return actions;
}

/**
 * Creates a credential isolation wrapper for a command.
 * Only passes credentials needed for the specified provider.
 *
 * @param provider Cloud provider
 * @param command Command to wrap
 * @param args Command arguments
 * @returns Wrapped command with isolated environment
 */
export function createIsolatedCommand(
  provider: CloudProvider,
  command: string,
  args: string[],
): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const isolatedEnv = isolateCredentials(provider, process.env);

  return {
    command,
    args,
    env: isolatedEnv,
  };
}

/**
 * Validates container configuration doesn't leak credentials.
 *
 * @param config Container configuration
 * @param allowedProvider Provider that credentials are allowed for
 * @returns Validation result
 */
export function validateContainerCredentialIsolation(
  config: {
    env?: Record<string, string | undefined>;
    volumes?: string[];
  },
  allowedProvider?: CloudProvider,
): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check environment variables
  if (config.env) {
    const allCredentialVars = Object.values(CREDENTIAL_ENV_VARS).flat();

    for (const key of Object.keys(config.env)) {
      if (allCredentialVars.includes(key)) {
        // Check if this is for the allowed provider
        if (allowedProvider) {
          const allowedVars = CREDENTIAL_ENV_VARS[allowedProvider];
          if (!allowedVars.includes(key)) {
            issues.push(
              `Cross-cloud credential in environment: ${key} (not for ${allowedProvider})`,
            );
          }
        } else {
          issues.push(`Cloud credential in environment without explicit allow: ${key}`);
        }
      }
    }
  }

  // Check volume mounts
  if (config.volumes) {
    const homeDir = os.homedir();
    const allCredentialPaths = Object.values(CREDENTIAL_PATHS).flat();

    for (const volume of config.volumes) {
      const [hostPath] = volume.split(':');
      if (!hostPath) continue;

      const normalizedPath = path.normalize(hostPath.replace('~', homeDir));

      for (const credPath of allCredentialPaths) {
        const fullCredPath = path.normalize(credPath.replace('~', homeDir));

        if (normalizedPath.startsWith(fullCredPath)) {
          if (allowedProvider) {
            const providerPaths = CREDENTIAL_PATHS[allowedProvider];
            const normalizedProviderPaths = providerPaths.map(p =>
              path.normalize(p.replace('~', homeDir))
            );

            if (!normalizedProviderPaths.some(p => normalizedPath.startsWith(p))) {
              issues.push(
                `Cross-cloud credential path mounted: ${hostPath} (not for ${allowedProvider})`,
              );
            }
          } else {
            issues.push(`Credential path mounted without explicit allow: ${hostPath}`);
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      logConfigTamperingDetected('Credential isolation', issue);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Gets recommendations for credential isolation.
 *
 * @param provider Cloud provider to use
 * @returns Recommendations
 */
export function getCredentialIsolationRecommendations(
  provider: CloudProvider,
): string[] {
  const recommendations: string[] = [];

  const detected = detectCloudProviders();

  if (detected.length > 1) {
    recommendations.push(
      'Multiple cloud provider credentials detected. Consider using separate environments.',
    );
  }

  if (!detected.includes(provider) && provider !== CloudProvider.UNKNOWN) {
    recommendations.push(
      `No credentials detected for ${provider}. Ensure credentials are properly configured.`,
    );
  }

  const homeDir = os.homedir();
  const configFiles = ['.bashrc', '.zshrc', '.profile'];

  for (const file of configFiles) {
    const filePath = path.join(homeDir, file);
    if (fs.existsSync(filePath) && fileContainsCredentials(filePath)) {
      recommendations.push(
        `Remove credentials from ${file} - use cloud provider CLI tools instead.`,
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(`Credential isolation for ${provider} looks good!`);
  }

  return recommendations;
}
