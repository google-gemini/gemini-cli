/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import type { MCPServerConfig } from '../config/config.js';
import { validateCommand, validateEnvironment, CommandValidationError } from './command-validator.js';

/**
 * Configuration validation utilities.
 *
 * SECURITY NOTE: This module validates configuration files to prevent
 * malicious configurations from executing arbitrary code.
 */

export interface ConfigValidationOptions {
  /**
   * Whether to allow potentially dangerous configurations.
   * If false, configurations with commands like 'bash', 'sh', etc. will be rejected.
   */
  allowDangerousCommands?: boolean;

  /**
   * Whether to require explicit user confirmation for untrusted configurations.
   */
  requireTrust?: boolean;

  /**
   * Base directory for validating paths.
   */
  baseDir?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

export class ConfigValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    public readonly severity: 'error' | 'warning' = 'error',
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates MCP server configuration for security issues.
 *
 * @param config MCP server configuration to validate
 * @param options Validation options
 * @returns Validation result with errors and warnings
 */
export function validateMCPServerConfig(
  serverName: string,
  config: MCPServerConfig,
  options: ConfigValidationOptions = {},
): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: string[] = [];

  // Validate command-based (stdio) configurations
  if (config.command) {
    try {
      validateCommand(
        config.command,
        config.args || [],
        {
          requireAbsolutePath: false, // Allow relative paths if in PATH
          allowDangerousCommands: options.allowDangerousCommands,
          trusted: config.trust,
        },
      );
    } catch (error) {
      if (error instanceof CommandValidationError) {
        errors.push(
          new ConfigValidationError(
            'command',
            `MCP server '${serverName}': ${error.message}`,
            'error',
          ),
        );
      } else {
        errors.push(
          new ConfigValidationError(
            'command',
            `MCP server '${serverName}': Unexpected validation error: ${error}`,
            'error',
          ),
        );
      }
    }

    // Warn if command is not an absolute path
    if (!path.isAbsolute(config.command) && !config.trust) {
      warnings.push(
        `MCP server '${serverName}': Command '${config.command}' is not an absolute path. ` +
        `This may execute a different binary than intended if PATH is modified. ` +
        `Consider using an absolute path or marking the server as trusted with --trust flag.`,
      );
    }

    // Validate environment variables
    if (config.env) {
      try {
        validateEnvironment(config.env);
      } catch (error) {
        if (error instanceof CommandValidationError) {
          errors.push(
            new ConfigValidationError(
              'env',
              `MCP server '${serverName}': ${error.message}`,
              'error',
            ),
          );
        }
      }
    }

    // Warn if cwd is set to a sensitive directory
    if (config.cwd) {
      const sensitiveDirs = ['/etc', '/root', '/var', '/sys', '/proc'];
      const normalizedCwd = path.normalize(config.cwd);
      for (const sensitiveDir of sensitiveDirs) {
        if (normalizedCwd.startsWith(sensitiveDir)) {
          warnings.push(
            `MCP server '${serverName}': Working directory '${config.cwd}' is in a sensitive system directory.`,
          );
          break;
        }
      }
    }
  }

  // Validate URL-based configurations
  if (config.url || config.httpUrl) {
    const url = config.url || config.httpUrl;
    try {
      const parsed = new URL(url!);

      // Warn about non-HTTPS URLs
      if (parsed.protocol === 'http:' && !parsed.hostname.match(/^(localhost|127\.0\.0\.1|::1)$/)) {
        warnings.push(
          `MCP server '${serverName}': URL '${url}' uses unencrypted HTTP. ` +
          `Consider using HTTPS for security.`,
        );
      }

      // Warn about localhost URLs (may indicate development server)
      if (parsed.hostname.match(/^(localhost|127\.0\.0\.1|::1)$/)) {
        warnings.push(
          `MCP server '${serverName}': URL '${url}' points to localhost. ` +
          `Ensure this is intentional and the local server is secure.`,
        );
      }
    } catch (error) {
      errors.push(
        new ConfigValidationError(
          'url',
          `MCP server '${serverName}': Invalid URL '${url}': ${error}`,
          'error',
        ),
      );
    }

    // Validate headers
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        // Check for potentially exposed secrets in headers
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
          warnings.push(
            `MCP server '${serverName}': Header '${key}' may contain sensitive data. ` +
            `Consider using OAuth instead of hardcoded credentials.`,
          );
        }

        // Validate header values for injection attempts
        if (value.includes('\n') || value.includes('\r')) {
          errors.push(
            new ConfigValidationError(
              'headers',
              `MCP server '${serverName}': Header '${key}' contains newline characters ` +
              `which could be used for header injection attacks.`,
              'error',
            ),
          );
        }
      }
    }
  }

  // Require either command or URL
  if (!config.command && !config.url && !config.httpUrl) {
    errors.push(
      new ConfigValidationError(
        'config',
        `MCP server '${serverName}': Must specify either 'command' (for stdio), ` +
        `'url' (for SSE), or 'httpUrl' (for HTTP).`,
        'error',
      ),
    );
  }

  // Validate trust flag usage
  if (config.trust && !options.requireTrust) {
    warnings.push(
      `MCP server '${serverName}': Marked as trusted. This server will bypass security ` +
      `validations and can execute arbitrary code. Only trust servers from reliable sources.`,
    );
  }

  // Validate timeout
  if (config.timeout !== undefined) {
    if (config.timeout < 0) {
      errors.push(
        new ConfigValidationError(
          'timeout',
          `MCP server '${serverName}': Timeout must be positive, got: ${config.timeout}`,
          'error',
        ),
      );
    }
    if (config.timeout > 3600000) { // 1 hour
      warnings.push(
        `MCP server '${serverName}': Timeout is very long (${config.timeout}ms). ` +
        `This may cause the CLI to hang for extended periods.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates all MCP servers in a configuration object.
 *
 * @param mcpServers Record of MCP server configurations
 * @param options Validation options
 * @returns Overall validation result
 */
export function validateAllMCPServers(
  mcpServers: Record<string, MCPServerConfig>,
  options: ConfigValidationOptions = {},
): ConfigValidationResult {
  const allErrors: ConfigValidationError[] = [];
  const allWarnings: string[] = [];

  for (const [serverName, config] of Object.entries(mcpServers)) {
    const result = validateMCPServerConfig(serverName, config, options);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Calculates a checksum for a configuration file to detect tampering.
 *
 * @param configPath Path to configuration file
 * @returns SHA-256 checksum
 */
export function calculateConfigChecksum(configPath: string): string {
  const content = fs.readFileSync(configPath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verifies a configuration file hasn't been tampered with.
 *
 * @param configPath Path to configuration file
 * @param expectedChecksum Expected SHA-256 checksum
 * @returns True if checksum matches
 */
export function verifyConfigChecksum(configPath: string, expectedChecksum: string): boolean {
  const actualChecksum = calculateConfigChecksum(configPath);
  return actualChecksum === expectedChecksum;
}

/**
 * Creates a signature for a configuration file using HMAC.
 *
 * @param configPath Path to configuration file
 * @param secretKey Secret key for signing
 * @returns HMAC-SHA256 signature
 */
export function signConfig(configPath: string, secretKey: string): string {
  const content = fs.readFileSync(configPath, 'utf8');
  return crypto.createHmac('sha256', secretKey).update(content).digest('hex');
}

/**
 * Verifies a configuration file signature.
 *
 * @param configPath Path to configuration file
 * @param signature Expected signature
 * @param secretKey Secret key for verification
 * @returns True if signature is valid
 */
export function verifyConfigSignature(
  configPath: string,
  signature: string,
  secretKey: string,
): boolean {
  const actualSignature = signConfig(configPath, secretKey);
  return crypto.timingSafeEqual(
    Buffer.from(actualSignature),
    Buffer.from(signature),
  );
}
