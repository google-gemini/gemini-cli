/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.ts';

/**
 * Comprehensive security validation utilities to prevent common vulnerabilities
 */

// Command injection patterns to block
const DANGEROUS_COMMAND_PATTERNS = [
  /[;&|`$(){}[\]<>\n\r]/, // Shell metacharacters
  /\b(rm|del|format|shutdown|reboot|halt|poweroff)\b/i, // Dangerous commands
  /\b(curl|wget)\b.*(bash|sh|zsh|fish)/i, // Script downloads
  /\|.*\||&&|\|\||;.*;/, // Command chaining
  /\$\(.*\)|\$\{.*\}/, // Command substitution
];

/**
 * Validates and sanitizes user input to prevent command injection
 */
export function validateAndSanitizeInput(input: string, context: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(input)) {
      throw new Error(`Potentially dangerous input detected in ${context}: contains forbidden characters or patterns`);
    }
  }

  // Additional validation for specific contexts
  switch (context) {
    case 'version':
      return validateVersionString(input);
    case 'command':
      return validateCommand(input);
    case 'filename':
      return validateFilename(input);
    case 'url':
      return validateUrl(input);
    default:
      return input.trim();
  }
}

/**
 * Validates version strings to prevent injection
 */
function validateVersionString(version: string): string {
  // Only allow alphanumeric, dots, hyphens, and plus signs
  const sanitized = version.replace(/[^a-zA-Z0-9.+\-]/g, '');

  if (sanitized !== version) {
    throw new Error('Version string contains invalid characters');
  }

  // Additional validation for semantic versioning
  if (!/^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/.test(sanitized)) {
    throw new Error('Invalid semantic version format');
  }

  return sanitized;
}

/**
 * Validates commands to prevent injection
 */
function validateCommand(command: string): string {
  // Basic command validation - should not contain shell metacharacters
  if (/[;&|`$(){}[\]<>\n\r]/.test(command)) {
    throw new Error('Command contains forbidden shell metacharacters');
  }

  // Should not start with dangerous commands
  const dangerousCommands = ['rm', 'del', 'format', 'shutdown', 'reboot', 'halt', 'poweroff', 'sudo'];
  const firstWord = command.trim().split(/\s+/)[0]?.toLowerCase();

  if (dangerousCommands.includes(firstWord)) {
    throw new Error(`Dangerous command detected: ${firstWord}`);
  }

  return command.trim();
}

/**
 * Validates filenames to prevent path traversal
 */
function validateFilename(filename: string): string {
  // Prevent path traversal attacks
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Filename contains invalid path characters');
  }

  // Only allow safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new Error('Filename contains invalid characters');
  }

  return filename;
}

/**
 * Validates URLs to prevent SSRF and other attacks
 */
function validateUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);

    // Block localhost and private IP ranges
    if (parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname === '127.0.0.1' ||
        parsedUrl.hostname.startsWith('192.168.') ||
        parsedUrl.hostname.startsWith('10.') ||
        parsedUrl.hostname.startsWith('172.')) {
      throw new Error('URL points to local or private network');
    }

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }

    return url;
  } catch (error) {
    throw new Error('Invalid URL format');
  }
}

/**
 * Validates OAuth tokens and project scoping
 */
export function validateOAuthToken(token: string, expectedProjectId?: string): boolean {
  if (!token || typeof token !== 'string' || token.length < 10) {
    return false;
  }

  // Basic token format validation (this would need to be more specific based on token format)
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token)) {
    return false;
  }

  // If project ID is provided, validate it matches the token's scope
  // This is a placeholder - actual implementation would decode and verify the token
  if (expectedProjectId) {
    // TODO: Implement actual token decoding and project validation
    return true;
  }

  return true;
}

/**
 * Validates MCP server configurations
 */
export function validateMCPServerConfig(config: any): boolean {
  if (!config || typeof config !== 'object') {
    return false;
  }

  // Validate server name
  if (!config.name || typeof config.name !== 'string' || config.name.length > 100) {
    return false;
  }

  // Validate command/path
  if (config.command && typeof config.command === 'string') {
    try {
      validateAndSanitizeInput(config.command, 'command');
    } catch {
      return false;
    }
  }

  // Validate environment variables
  if (config.env && typeof config.env === 'object') {
    for (const [key, value] of Object.entries(config.env)) {
      if (typeof value !== 'string') {
        return false;
      }
      // Validate environment variable names
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Sanitizes environment variables for sandbox usage
 */
export function sanitizeEnvironmentVariables(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const blockedVars = [
    'PATH', 'HOME', 'USER', 'SHELL', 'PWD',
    'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD',
    'AWS_ACCESS_KEY', 'AWS_SECRET_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS'
  ];

  for (const [key, value] of Object.entries(env)) {
    // Skip blocked variables
    if (blockedVars.includes(key.toUpperCase())) {
      continue;
    }

    // Validate key format
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      continue;
    }

    // Basic value validation
    if (typeof value === 'string' && value.length < 1000) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Validates sandbox flags and arguments
 */
export function validateSandboxFlags(flags: string[]): string[] {
  const allowedFlags = [
    '--read-only', '--tmpfs', '--memory', '--cpu-shares',
    '--network', '--ipc', '--pid', '--uts'
  ];

  return flags.filter(flag =>
    allowedFlags.some(allowed => flag.startsWith(allowed))
  );
}

/**
 * Comprehensive argument validation for CLI commands
 */
export function validateCLIArguments(args: string[], settings: LoadedSettings): string[] {
  const validatedArgs: string[] = [];

  for (const arg of args) {
    // Skip empty arguments
    if (!arg || typeof arg !== 'string') {
      continue;
    }

    // Check for dangerous patterns
    try {
      const sanitized = validateAndSanitizeInput(arg, 'argument');
      if (sanitized) {
        validatedArgs.push(sanitized);
      }
    } catch (error) {
      // Log the error but don't include the dangerous argument
      console.warn(`Skipping potentially dangerous argument: ${error.message}`);
    }
  }

  return validatedArgs;
}
