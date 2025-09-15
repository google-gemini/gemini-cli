/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP server security controls and validation
 */

import { securityLogger, SecurityEventType, SecuritySeverity } from '../utils/securityLogger.js';
// import { sanitizeSandboxEnvironment } from '../utils/sandboxSecurity.js';

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

export interface MCPSecurityConfig {
  allowedServers?: Set<string>;
  requireValidation?: boolean;
  promptForUnknown?: boolean;
  maxExecutionTime?: number;
  validateCommands?: boolean;
}

/**
 * MCP server security manager
 */
export class MCPSecurityManager {
  private config: MCPSecurityConfig;

  constructor(config: MCPSecurityConfig = {}) {
    this.config = {
      allowedServers: new Set(),
      requireValidation: true,
      promptForUnknown: false,
      maxExecutionTime: 30000,
      validateCommands: true,
      ...config
    };
  }

  /**
   * Validates an MCP server configuration for security
   */
  async validateServer(
    serverName: string,
    serverConfig: MCPServerConfig
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if server is in allow-list
    if (this.config.allowedServers && this.config.allowedServers.size > 0) {
      if (!this.config.allowedServers.has(serverName)) {
        securityLogger.log(
          SecurityEventType.SERVER_VALIDATION,
          SecuritySeverity.MEDIUM,
          `MCP server not in allow-list`,
          { serverName },
          'mcp'
        );

        return {
          valid: false,
          reason: 'Server not in allow-list'
        };
      }
    }

    // Validate command if present
    if (this.config.validateCommands && serverConfig.command) {
      const commandValid = this.validateCommand(serverConfig.command);
      if (!commandValid) {
        securityLogger.log(
          SecurityEventType.SERVER_VALIDATION,
          SecuritySeverity.HIGH,
          `Invalid command in MCP server configuration`,
          { serverName, command: serverConfig.command },
          'mcp'
        );

        return {
          valid: false,
          reason: 'Invalid command'
        };
      }
    }

    // Validate arguments if present
    if (serverConfig.args) {
      const argsValid = this.validateArguments(serverConfig.args);
      if (!argsValid) {
        securityLogger.log(
          SecurityEventType.SERVER_VALIDATION,
          SecuritySeverity.HIGH,
          `Invalid arguments in MCP server configuration`,
          { serverName, args: serverConfig.args },
          'mcp'
        );

        return {
          valid: false,
          reason: 'Invalid arguments'
        };
      }
    }

    // Validate execution timeout
    if (serverConfig.timeout && serverConfig.timeout > this.config.maxExecutionTime!) {
      securityLogger.log(
        SecurityEventType.SERVER_VALIDATION,
        SecuritySeverity.MEDIUM,
        `MCP server timeout exceeds maximum allowed`,
        { serverName, timeout: serverConfig.timeout, maxAllowed: this.config.maxExecutionTime },
        'mcp'
      );
    }

    securityLogger.log(
      SecurityEventType.SERVER_VALIDATION,
      SecuritySeverity.LOW,
      `MCP server validation successful`,
      { serverName },
      'mcp'
    );

    return { valid: true };
  }

  /**
   * Validates a command string for security
   */
  private validateCommand(command: string): boolean {
    // Basic validation - reject commands with shell metacharacters
    const dangerousChars = /[;&|`$(){}[\]<>]/;
    if (dangerousChars.test(command)) {
      return false;
    }

    // Reject commands that look like paths with suspicious patterns
    if (command.includes('..') || command.startsWith('/tmp/') || command.startsWith('/var/tmp/')) {
      return false;
    }

    // Additional validation can be added here
    return true;
  }

  /**
   * Validates command arguments for security
   */
  private validateArguments(args: string[]): boolean {
    for (const arg of args) {
      // Reject arguments with shell metacharacters
      const dangerousChars = /[;&|`$(){}[\]<>]/;
      if (dangerousChars.test(arg)) {
        return false;
      }

      // Reject arguments that look like suspicious file paths
      if (arg.includes('..') || arg.startsWith('/tmp/') || arg.startsWith('/var/tmp/')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitizes server configuration for safe execution
   */
  sanitizeServerConfig(config: MCPServerConfig): MCPServerConfig {
    const sanitized: MCPServerConfig = { ...config };

    // Ensure timeout doesn't exceed maximum
    if (sanitized.timeout && sanitized.timeout > this.config.maxExecutionTime!) {
      sanitized.timeout = this.config.maxExecutionTime;
    }

    // Sanitize environment variables if present
    if (sanitized.env) {
      // TODO: Implement sandbox environment sanitization
      // sanitized.env = sanitizeSandboxEnvironment(sanitized.env);
    }

    return sanitized;
  }

  /**
   * Updates the allow-list of trusted servers
   */
  updateAllowList(servers: string[]): void {
    this.config.allowedServers = new Set(servers);
    securityLogger.log(
      SecurityEventType.SERVER_VALIDATION,
      SecuritySeverity.LOW,
      `MCP server allow-list updated`,
      { serverCount: servers.length },
      'mcp'
    );
  }

  /**
   * Gets current security configuration
   */
  getSecurityConfig(): Readonly<MCPSecurityConfig> {
    return { ...this.config };
  }
}

// Default security configuration
export const DEFAULT_MCP_SECURITY_CONFIG: MCPSecurityConfig = {
  allowedServers: new Set(),
  requireValidation: true,
  promptForUnknown: false,
  maxExecutionTime: 30000,
  validateCommands: true
};

// Global MCP security manager instance
export const mcpSecurityManager = new MCPSecurityManager(DEFAULT_MCP_SECURITY_CONFIG);
