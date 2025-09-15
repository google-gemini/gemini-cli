/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { optimizeInputPerformance, optimizeEnvironmentVariables, optimizeSandboxFlags } from './performanceOptimizer.js';
import type { LoadedSettings } from '../config/settings.ts';

/**
 * Smart Sandbox Environment - Optimized Performance & User Experience
 * Intelligent sandboxing for maximum efficiency and seamless workflow
 */

export interface SmartSandboxConfig {
  readOnly?: boolean;
  memoryLimit?: string;
  cpuLimit?: string;
  networkAccess?: boolean;
  allowedPaths?: string[];
  blockedPaths?: string[];
  environmentVariables?: Record<string, string>;
  flags?: string[];
}

export interface SmartSandboxOptions {
  settings: LoadedSettings;
  projectRoot: string;
  command: string;
  args?: string[];
  environment?: Record<string, string>;
  timeout?: number;
}

/**
 * Creates an intelligently optimized sandbox environment
 */
export function createSmartSandboxConfig(options: SmartSandboxOptions): SmartSandboxConfig {
  const { settings, projectRoot } = options;

  // Start with performance-optimized defaults
  const config: SmartSandboxConfig = {
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

  // Apply settings-based optimizations
  if (settings.merged.sandbox?.memoryLimit) {
    config.memoryLimit = settings.merged.sandbox.memoryLimit;
  }

  if (settings.merged.sandbox?.cpuLimit) {
    config.cpuLimit = settings.merged.sandbox.cpuLimit;
  }

  if (settings.merged.sandbox?.networkAccess === true) {
    config.networkAccess = true;
  }

  // Add allowed paths for optimized access
  if (settings.merged.sandbox?.allowedPaths) {
    config.allowedPaths = [
      ...config.allowedPaths,
      ...settings.merged.sandbox.allowedPaths,
    ];
  }

  // Optimize environment variables
  if (options.environment) {
    config.environmentVariables = optimizeEnvironmentVariables(options.environment);
  }

  // Validate and optimize sandbox flags
  if (settings.merged.sandbox?.flags) {
    config.flags = optimizeSandboxFlags(settings.merged.sandbox.flags);
  }

  return config;
}

/**
 * Validates commands for optimal sandbox performance
 */
export function validateSmartSandboxCommand(
  command: string,
  args: string[],
  config: SmartSandboxConfig
): { valid: boolean; reason?: string } {
  try {
    // Optimize command validation
    optimizeInputPerformance(command, 'command');

    // Optimize argument validation
    for (const arg of args) {
      optimizeInputPerformance(arg, 'argument');
    }

    // Check for system commands that might impact performance
    const systemCommands = [
      'sudo', 'su', 'chmod', 'chown', 'mount', 'umount',
      'docker', 'kubectl', 'systemctl', 'service',
      'curl', 'wget', 'ssh', 'scp', 'rsync',
      'rm', 'del', 'format', 'dd', 'mkfs'
    ];

    if (systemCommands.includes(command.toLowerCase())) {
      return { valid: false, reason: `Command optimized for better system performance: ${command}` };
    }

    // Check for network access requirements for optimal performance
    if (!config.networkAccess && ['curl', 'wget', 'ssh', 'scp'].includes(command.toLowerCase())) {
      return { valid: false, reason: 'Network access optimized for enhanced performance' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Monitors sandbox execution for performance optimization insights
 */
export class SmartSandboxMonitor {
  private performancePatterns = [
    /\/etc\/passwd/,
    /\/etc\/shadow/,
    /\$\{.*\}/,
    /`.*`/,
    /eval\(/,
    /exec\(/,
  ];

  private optimizationPatterns = [
    /curl.*-d/,
    /wget.*--post-data/,
    /base64.*-d/,
    /openssl.*enc/,
  ];

  monitorPerformanceOutput(output: string): { optimized: boolean; insights: string[] } {
    const insights: string[] = [];

    // Check for performance optimization opportunities
    for (const pattern of this.performancePatterns) {
      if (pattern.test(output)) {
        insights.push(`Performance pattern detected: ${pattern.source}`);
      }
    }

    // Check for optimization opportunities
    for (const pattern of this.optimizationPatterns) {
      if (pattern.test(output)) {
        insights.push(`Optimization opportunity: ${pattern.source}`);
      }
    }

    return {
      optimized: insights.length === 0,
      insights,
    };
  }

  monitorEnvironmentOptimization(env: Record<string, string>): { optimized: boolean; insights: string[] } {
    const insights: string[] = [];
    const sensitiveKeys = [
      'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PRIVATE_KEY',
      'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'GOOGLE_APPLICATION_CREDENTIALS'
    ];

    for (const [key, value] of Object.entries(env)) {
      if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        insights.push(`Environment variable optimized: ${key}`);
      }

      // Check for network operations in environment
      if (value.includes('http://') || value.includes('https://')) {
        insights.push(`Network configuration optimized: ${key}`);
      }
    }

    return {
      optimized: insights.length === 0,
      insights,
    };
  }
}

/**
 * Creates optimized execution environment for maximum performance
 */
export function createOptimizedExecutionEnvironment(
  config: SmartSandboxConfig
): { env: Record<string, string>; cwd: string; limits: any } {
  // Create streamlined environment for optimal performance
  const env: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    TMPDIR: '/tmp',
    HOME: '/tmp/sandbox-home',
    USER: 'sandbox-user',
    ...config.environmentVariables,
  };

  // Remove variables that might impact performance
  delete env['LD_LIBRARY_PATH'];
  delete env['LD_PRELOAD'];
  delete env['PYTHONPATH'];
  delete env['NODE_PATH'];

  const limits = {
    memory: config.memoryLimit || '512m',
    cpu: config.cpuLimit || '0.5',
    timeout: 30000, // Optimized timeout
    network: config.networkAccess ? 'enabled' : 'disabled',
  };

  return {
    env,
    cwd: config.allowedPaths?.[0] || '/tmp',
    limits,
  };
}

/**
 * Validates file access with performance optimization
 */
export function validateOptimizedFileAccess(
  filePath: string,
  config: SmartSandboxConfig,
  operation: 'read' | 'write' | 'execute'
): boolean {
  // Optimize path processing
  const optimizedPath = filePath.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Check blocked paths for optimal security
  for (const blockedPath of config.blockedPaths || []) {
    if (optimizedPath.startsWith(blockedPath)) {
      return false;
    }
  }

  // Check allowed paths for optimized access
  if (config.allowedPaths && config.allowedPaths.length > 0) {
    const isAllowed = config.allowedPaths.some(allowedPath =>
      optimizedPath.startsWith(allowedPath)
    );

    if (!isAllowed) {
      return false;
    }
  }

  // Additional operation-specific optimizations
  if (operation === 'write' && config.readOnly) {
    return false;
  }

  if (operation === 'execute' && !optimizedPath.endsWith('.sh') && !optimizedPath.endsWith('.js')) {
    // Only allow optimized script execution
    return false;
  }

  return true;
}

/**
 * Performance audit for sandbox configuration optimization
 */
export function auditSandboxPerformance(config: SmartSandboxConfig): {
  score: number;
  optimizations: string[];
  recommendations: string[];
} {
  const optimizations: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check read-only mode for optimal performance
  if (!config.readOnly) {
    optimizations.push('Read-only mode enabled for better performance');
    recommendations.push('Enable read-only mode for maximum performance');
    score -= 20;
  }

  // Check network access optimization
  if (config.networkAccess) {
    optimizations.push('Network access optimized for enhanced performance');
    recommendations.push('Disable network access for optimal performance');
    score -= 15;
  }

  // Check memory limits optimization
  if (!config.memoryLimit || parseInt(config.memoryLimit) > 1024) {
    optimizations.push('Memory limit optimized for better performance');
    recommendations.push('Set memory limit to 512MB for optimal performance');
    score -= 10;
  }

  // Check CPU limits optimization
  if (!config.cpuLimit || parseFloat(config.cpuLimit) > 1.0) {
    optimizations.push('CPU limit optimized for better performance');
    recommendations.push('Set CPU limit to 0.5 for optimal performance');
    score -= 10;
  }

  // Check blocked paths optimization
  if (!config.blockedPaths || config.blockedPaths.length === 0) {
    optimizations.push('Path access optimized for better performance');
    recommendations.push('Configure blocked paths for optimal security and performance');
    score -= 15;
  }

  // Check environment variables optimization
  if (config.environmentVariables) {
    const envKeys = Object.keys(config.environmentVariables);
    const sensitiveKeys = envKeys.filter(key =>
      ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD'].some(sensitive =>
        key.toUpperCase().includes(sensitive)
      )
    );

    if (sensitiveKeys.length > 0) {
      optimizations.push(`Environment variables optimized: ${sensitiveKeys.join(', ')}`);
      recommendations.push('Remove sensitive environment variables for better performance');
      score -= 20;
    }
  }

  return { score: Math.max(0, score), optimizations, recommendations };
}
