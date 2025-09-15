/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateAndSanitizeInput, sanitizeEnvironmentVariables, validateSandboxFlags } from './securityValidators.js';
import type { LoadedSettings } from '../config/settings.js';

/**
 * Sandbox security hardening utilities
 */

export interface SandboxConfig {
  readOnly?: boolean;
  memoryLimit?: string;
  cpuLimit?: string;
  networkAccess?: boolean;
  allowedPaths?: string[];
  blockedPaths?: string[];
  environmentVariables?: Record<string, string>;
  flags?: string[];
}

export interface SecureSandboxOptions {
  settings: LoadedSettings;
  projectRoot: string;
  command: string;
  args?: string[];
  environment?: Record<string, string>;
  timeout?: number;
}

/**
 * Hardens sandbox environment to prevent data exfiltration and privilege escalation
 */
export function createSecureSandboxConfig(options: SecureSandboxOptions): SandboxConfig {
  const { settings, projectRoot } = options;

  // Start with restrictive defaults
  const config: SandboxConfig = {
    readOnly: true,
    memoryLimit: '512m',
    cpuLimit: '0.5',
    networkAccess: false,
    allowedPaths: [projectRoot],
    blockedPaths: [
      '/etc',
      '/home',
      '/root',
      '/usr/local',
      '/var',
      process.env['HOME'] || '/tmp',
    ],
    environmentVariables: {},
    flags: [],
  };

  // Apply settings-based customizations
  if (settings.merged.sandbox?.memoryLimit) {
    config.memoryLimit = settings.merged.sandbox.memoryLimit;
  }

  if (settings.merged.sandbox?.cpuLimit) {
    config.cpuLimit = settings.merged.sandbox.cpuLimit;
  }

  if (settings.merged.sandbox?.networkAccess === true) {
    config.networkAccess = true;
  }

  // Add allowed paths from settings
  if (settings.merged.sandbox?.allowedPaths) {
    config.allowedPaths = [
      ...(config.allowedPaths || []),
      ...settings.merged.sandbox.allowedPaths,
    ];
  }

  // Sanitize environment variables
  if (options.environment) {
    config.environmentVariables = sanitizeEnvironmentVariables(options.environment);
  }

  // Validate and add sandbox flags
  if (settings.merged.sandbox?.flags) {
    config.flags = validateSandboxFlags(settings.merged.sandbox.flags);
  }

  return config;
}

/**
 * Validates commands before execution in sandbox
 */
export function validateSandboxCommand(
  command: string,
  args: string[],
  config: SandboxConfig
): { valid: boolean; reason?: string } {
  try {
    // Validate command itself
    validateAndSanitizeInput(command, 'command');

    // Validate arguments
    for (const arg of args) {
      validateAndSanitizeInput(arg, 'argument');
    }

    // Check for dangerous commands
    const dangerousCommands = [
      'sudo', 'su', 'chmod', 'chown', 'mount', 'umount',
      'docker', 'kubectl', 'aws', 'gcloud', 'az',
      'curl', 'wget', 'ssh', 'scp', 'rsync'
    ];

    if (dangerousCommands.includes(command.toLowerCase())) {
      return { valid: false, reason: `Dangerous command not allowed in sandbox: ${command}` };
    }

    // Check for network access requirements
    if (!config.networkAccess && ['curl', 'wget', 'ssh', 'scp'].includes(command.toLowerCase())) {
      return { valid: false, reason: 'Network access disabled in sandbox' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Monitors sandbox execution for suspicious activity
 */
export class SandboxMonitor {
  private suspiciousPatterns = [
    /\/etc\/passwd/,
    /\/etc\/shadow/,
    /\$\{.*\}/,
    /`.*`/,
    /eval\(/,
    /exec\(/,
    /system\(/,
  ];

  private dataExfiltrationPatterns = [
    /curl.*-d/,
    /wget.*--post-data/,
    /base64.*-d/,
    /openssl.*enc/,
  ];

  monitorOutput(output: string): { suspicious: boolean; alerts: string[] } {
    const alerts: string[] = [];

    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(output)) {
        alerts.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    // Check for data exfiltration attempts
    for (const pattern of this.dataExfiltrationPatterns) {
      if (pattern.test(output)) {
        alerts.push(`Potential data exfiltration: ${pattern.source}`);
      }
    }

    return {
      suspicious: alerts.length > 0,
      alerts,
    };
  }

  monitorEnvironment(env: Record<string, string>): { suspicious: boolean; alerts: string[] } {
    const alerts: string[] = [];
    const sensitiveKeys = [
      'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PRIVATE_KEY',
      'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'GOOGLE_APPLICATION_CREDENTIALS'
    ];

    for (const [key, value] of Object.entries(env)) {
      if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        alerts.push(`Sensitive environment variable detected: ${key}`);
      }

      // Check for suspicious values
      if (value.includes('http://') || value.includes('https://')) {
        alerts.push(`Environment variable contains URL: ${key}`);
      }
    }

    return {
      suspicious: alerts.length > 0,
      alerts,
    };
  }
}

/**
 * Creates isolated execution environment
 */
export function createIsolatedExecutionEnvironment(
  config: SandboxConfig
): { env: Record<string, string>; cwd: string; limits: any } {
  // Create minimal environment
  const env: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    TMPDIR: '/tmp',
    HOME: '/tmp/sandbox-home',
    USER: 'sandbox-user',
    ...config.environmentVariables,
  };

  // Remove potentially dangerous environment variables
  delete env['LD_LIBRARY_PATH'];
  delete env['LD_PRELOAD'];
  delete env['PYTHONPATH'];
  delete env['NODE_PATH'];
  delete env['PERL5LIB'];

  const limits = {
    memory: config.memoryLimit || '512m',
    cpu: config.cpuLimit || '0.5',
    timeout: 30000, // 30 seconds default
    network: config.networkAccess ? 'enabled' : 'disabled',
  };

  return {
    env,
    cwd: config.allowedPaths?.[0] || '/tmp',
    limits,
  };
}

/**
 * Validates file access within sandbox
 */
export function validateFileAccess(
  filePath: string,
  config: SandboxConfig,
  operation: 'read' | 'write' | 'execute'
): boolean {
  // Normalize path
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Check blocked paths
  for (const blockedPath of config.blockedPaths || []) {
    if (normalizedPath.startsWith(blockedPath)) {
      return false;
    }
  }

  // Check allowed paths (only if any are specified)
  if (config.allowedPaths && config.allowedPaths.length > 0) {
    const isAllowed = config.allowedPaths.some(allowedPath =>
      normalizedPath.startsWith(allowedPath)
    );

    if (!isAllowed) {
      return false;
    }
  }

  // Additional checks based on operation
  if (operation === 'write' && config.readOnly) {
    return false;
  }

  if (operation === 'execute' && !normalizedPath.endsWith('.sh') && !normalizedPath.endsWith('.js')) {
    // Only allow execution of shell scripts and JS files
    return false;
  }

  return true;
}

/**
 * Security audit for sandbox configuration
 */
export function auditSandboxConfiguration(config: SandboxConfig): {
  score: number;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check read-only mode
  if (!config.readOnly) {
    issues.push('Sandbox is not read-only');
    recommendations.push('Enable read-only mode for better security');
    score -= 20;
  }

  // Check network access
  if (config.networkAccess) {
    issues.push('Network access is enabled');
    recommendations.push('Disable network access unless absolutely necessary');
    score -= 15;
  }

  // Check memory limits
  if (!config.memoryLimit || parseInt(config.memoryLimit) > 1024) {
    issues.push('Memory limit is too high or not set');
    recommendations.push('Set memory limit to 512MB or less');
    score -= 10;
  }

  // Check CPU limits
  if (!config.cpuLimit || parseFloat(config.cpuLimit) > 1.0) {
    issues.push('CPU limit is too high or not set');
    recommendations.push('Set CPU limit to 0.5 or less');
    score -= 10;
  }

  // Check blocked paths
  if (!config.blockedPaths || config.blockedPaths.length === 0) {
    issues.push('No blocked paths configured');
    recommendations.push('Configure blocked paths for /etc, /home, /root, etc.');
    score -= 15;
  }

  // Check environment variables
  if (config.environmentVariables) {
    const envKeys = Object.keys(config.environmentVariables);
    const sensitiveKeys = envKeys.filter(key =>
      ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD'].some(sensitive =>
        key.toUpperCase().includes(sensitive)
      )
    );

    if (sensitiveKeys.length > 0) {
      issues.push(`Sensitive environment variables detected: ${sensitiveKeys.join(', ')}`);
      recommendations.push('Remove sensitive environment variables from sandbox');
      score -= 20;
    }
  }

  return { score: Math.max(0, score), issues, recommendations };
}
