/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateAndSanitizeInput, validateMCPServerConfig } from './securityValidators.js';
import type { LoadedSettings } from '../config/settings.js';

/**
 * MCP Server security validation and hardening utilities
 */

export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
  healthCheck?: string;
}

export interface MCPValidationResult {
  valid: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations?: string[];
}

/**
 * Comprehensive MCP server security validator
 */
export class MCPServerValidator {
  private readonly dangerousCommands = [
    'sudo', 'su', 'chmod', 'chown', 'mount', 'umount',
    'docker', 'kubectl', 'systemctl', 'service',
    'curl', 'wget', 'ssh', 'scp', 'rsync',
    'rm', 'del', 'format', 'dd', 'mkfs'
  ];

  private readonly suspiciousArgs = [
    '--privileged', '--host', '--network=host',
    '--volume=/', '--volume=/etc', '--volume=/home',
    '-e', '--env', '--environment'
  ];

  validateServerConfig(config: MCPServerConfig, settings: LoadedSettings): MCPValidationResult {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Validate server name
    if (!config.name || config.name.length > 50) {
      return {
        valid: false,
        reason: 'Invalid server name',
        riskLevel: 'high'
      };
    }

    // Check if server is in allowlist
    const allowedServers = settings.merged.mcp?.allowedServers;
    if (allowedServers && Array.isArray(allowedServers)) {
      if (!allowedServers.includes(config.name)) {
        return {
          valid: false,
          reason: `Server ${config.name} is not in the allowed servers list`,
          riskLevel: 'critical'
        };
      }
    }

    // Validate command
    if (config.command) {
      try {
        validateAndSanitizeInput(config.command, 'command');
      } catch (error) {
        return {
          valid: false,
          reason: `Invalid command: ${error instanceof Error ? error.message : String(error)}`,
          riskLevel: 'critical'
        };
      }

      // Check for dangerous commands
      if (this.dangerousCommands.includes(config.command.toLowerCase())) {
        issues.push(`Dangerous command detected: ${config.command}`);
        riskLevel = 'critical';
        recommendations.push('Remove dangerous commands from MCP server configuration');
      }
    }

    // Validate arguments
    if (config.args && Array.isArray(config.args)) {
      for (let i = 0; i < config.args.length; i++) {
        const arg = config.args[i];

        // Check for suspicious arguments
        if (this.suspiciousArgs.some(suspicious => arg.includes(suspicious))) {
          issues.push(`Suspicious argument detected: ${arg}`);
          riskLevel = riskLevel === 'low' ? 'high' : 'critical';
          recommendations.push('Remove privileged arguments from MCP server configuration');
        }

        // Validate argument format
        try {
          validateAndSanitizeInput(arg, 'argument');
        } catch (error) {
          issues.push(`Invalid argument at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
          riskLevel = 'high';
        }
      }
    }

    // Validate environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Check for sensitive environment variables
        if (this.isSensitiveEnvVar(key)) {
          issues.push(`Sensitive environment variable: ${key}`);
          riskLevel = riskLevel === 'low' ? 'medium' : 'high';
          recommendations.push('Remove sensitive environment variables from MCP server config');
        }

        // Validate environment variable values
        if (typeof value === 'string' && value.length > 1000) {
          issues.push(`Environment variable value too long: ${key}`);
          riskLevel = 'medium';
        }
      }
    }

    // Validate timeout
    if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
      issues.push('Invalid timeout value');
      recommendations.push('Set timeout between 1-300 seconds');
      riskLevel = 'medium';
    }

    // Validate retry attempts
    if (config.retryAttempts && config.retryAttempts > 5) {
      issues.push('Too many retry attempts');
      recommendations.push('Limit retry attempts to 5 or less');
      riskLevel = 'medium';
    }

    return {
      valid: issues.length === 0,
      reason: issues.length > 0 ? issues.join('; ') : undefined,
      riskLevel,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
  }

  private isSensitiveEnvVar(key: string): boolean {
    const sensitivePatterns = [
      /API_KEY/, /SECRET/, /TOKEN/, /PASSWORD/, /PRIVATE_KEY/,
      /AWS_ACCESS/, /AWS_SECRET/, /GOOGLE.*CREDENTIALS/,
      /DATABASE_URL/, /DB_PASSWORD/, /REDIS_URL/
    ];

    return sensitivePatterns.some(pattern => pattern.test(key.toUpperCase()));
  }
}

/**
 * MCP Server runtime monitor for suspicious activity
 */
export class MCPServerMonitor {
  private serverActivity: Map<string, {
    startTime: number;
    commandCount: number;
    lastActivity: number;
    suspiciousActivities: string[];
  }> = new Map();

  recordServerActivity(serverName: string, activity: string, isSuspicious: boolean = false): void {
    const server = this.serverActivity.get(serverName) || {
      startTime: Date.now(),
      commandCount: 0,
      lastActivity: Date.now(),
      suspiciousActivities: []
    };

    server.commandCount++;
    server.lastActivity = Date.now();

    if (isSuspicious) {
      server.suspiciousActivities.push(`${new Date().toISOString()}: ${activity}`);
    }

    this.serverActivity.set(serverName, server);

    // Alert on suspicious activity
    if (isSuspicious) {
      console.warn(`Suspicious MCP server activity: ${serverName} - ${activity}`);
    }
  }

  getServerReport(serverName: string): { name: string; activity: string[]; isSecure: boolean; lastActivity: Date } | null {
    const server = this.serverActivity.get(serverName);
    if (!server) return null;

    const uptime = Date.now() - server.startTime;
    const activityRate = server.commandCount / (uptime / 1000 / 60); // commands per minute

    return {
      serverName,
      uptime,
      commandCount: server.commandCount,
      activityRate,
      lastActivity: new Date(server.lastActivity).toISOString(),
      suspiciousActivities: server.suspiciousActivities,
      riskAssessment: this.assessServerRisk(server)
    };
  }

  private assessServerRisk(server: { suspiciousActivities: any[]; activityRate: number; commandCount: number }): string {
    if (server.suspiciousActivities.length > 5) return 'CRITICAL';
    if (server.suspiciousActivities.length > 2) return 'HIGH';
    if (server.activityRate > 10) return 'MEDIUM'; // High activity rate
    if (server.commandCount > 100) return 'MEDIUM'; // High command volume
    return 'LOW';
  }

  getAllServersReport(): Record<string, { name: string; activity: string[]; isSecure: boolean; lastActivity: Date; suspiciousActivities: any[]; riskAssessment: string }> {
    const report: Record<string, { name: string; activity: string[]; isSecure: boolean; lastActivity: Date; suspiciousActivities: any[]; riskAssessment: string }> = {};
    for (const serverName of this.serverActivity.keys()) {
      report[serverName] = this.getServerReport(serverName);
    }
    return report;
  }
}

/**
 * Secure MCP server launcher with validation
 */
export class SecureMCPServerLauncher {
  private validator = new MCPServerValidator();
  private monitor = new MCPServerMonitor();

  async launchServer(
    config: MCPServerConfig,
    settings: LoadedSettings
  ): Promise<{ success: boolean; process?: any; error?: string }> {
    // Validate configuration
    const validation = this.validator.validateServerConfig(config, settings);

    if (!validation.valid) {
      this.monitor.recordServerActivity(config.name, `Failed validation: ${validation.reason}`, true);
      return {
        success: false,
        error: validation.reason
      };
    }

    // Log validation result
    this.monitor.recordServerActivity(
      config.name,
      `Validation passed (risk: ${validation.riskLevel})`
    );

    // Check risk level
    if (validation.riskLevel === 'critical') {
      return {
        success: false,
        error: 'Server configuration has critical security issues'
      };
    }

    // Warn about high-risk configurations
    if (validation.riskLevel === 'high') {
      console.warn(`Launching high-risk MCP server: ${config.name}`);
      console.warn(`Recommendations: ${validation.recommendations?.join(', ')}`);
    }

    try {
      // Launch the server (placeholder - actual implementation would spawn the process)
      this.monitor.recordServerActivity(config.name, 'Server launched successfully');

      return {
        success: true,
        process: { /* mock process object */ }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.monitor.recordServerActivity(config.name, `Launch failed: ${errorMessage}`, true);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  getServerMonitor(): MCPServerMonitor {
    return this.monitor;
  }
}

/**
 * MCP server allowlist manager
 */
export class MCPAllowlistManager {
  private allowlist: Set<string> = new Set();
  private readonly maxServers = 100;

  addServer(serverName: string): boolean {
    if (this.allowlist.size >= this.maxServers) {
      console.warn('Maximum number of allowed MCP servers reached');
      return false;
    }

    // Validate server name
    if (!serverName || serverName.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(serverName)) {
      return false;
    }

    this.allowlist.add(serverName);
    return true;
  }

  removeServer(serverName: string): boolean {
    return this.allowlist.delete(serverName);
  }

  isAllowed(serverName: string): boolean {
    return this.allowlist.has(serverName);
  }

  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  clearAllowlist(): void {
    this.allowlist.clear();
  }
}
