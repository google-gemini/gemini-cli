/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  logCommandBlocked,
  logEnvironmentInjectionBlocked,
  logPathTraversalBlocked,
  logTrustFlagUsed,
} from './security-audit-logger.js';
import { validateArguments } from './argument-validator.js';

/**
 * Security validation utilities for command execution.
 *
 * SECURITY NOTE: This module provides defense-in-depth protections against
 * command injection and arbitrary code execution vulnerabilities.
 */

/**
 * Dangerous commands and patterns that should never be executed
 * from untrusted configuration files.
 */
const DANGEROUS_COMMANDS = new Set([
  'bash',
  'sh',
  'zsh',
  'fish',
  'cmd',
  'powershell',
  'pwsh',
  'python',
  'python3',
  'perl',
  'ruby',
  'php',
  'node',
  'eval',
  'exec',
  'curl',
  'wget',
  'nc',
  'netcat',
  'telnet',
  'ssh',
  'scp',
  'ftp',
  'rm',
  'del',
  'format',
  'dd',
]);

/**
 * Dangerous patterns in command arguments that indicate shell injection
 */
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>]/,  // Shell metacharacters
  /\$\(/,               // Command substitution
  /`/,                  // Backtick command substitution
  /\|\|/,               // Logical OR
  /&&/,                 // Logical AND
  /<\(/,                // Process substitution
  />\(/,                // Process substitution
];

/**
 * Validation error types
 */
export enum ValidationErrorType {
  DANGEROUS_COMMAND = 'DANGEROUS_COMMAND',
  SHELL_INJECTION = 'SHELL_INJECTION',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  ABSOLUTE_PATH_REQUIRED = 'ABSOLUTE_PATH_REQUIRED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  NOT_EXECUTABLE = 'NOT_EXECUTABLE',
}

export class CommandValidationError extends Error {
  constructor(
    public readonly type: ValidationErrorType,
    message: string,
    public readonly command?: string,
  ) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

/**
 * Validates that a command is safe to execute.
 *
 * @param command The command to validate
 * @param args Arguments to the command
 * @param options Validation options
 * @throws CommandValidationError if validation fails
 */
export function validateCommand(
  command: string,
  args: string[] = [],
  options: {
    requireAbsolutePath?: boolean;
    allowDangerousCommands?: boolean;
    trusted?: boolean;
    serverName?: string;
  } = {},
): void {
  // If marked as trusted by user, log and skip validation
  if (options.trusted) {
    logTrustFlagUsed(command, options.serverName);
    return;
  }

  // Check for dangerous commands
  const commandBasename = path.basename(command).toLowerCase().replace(/\.(exe|bat|cmd)$/, '');
  if (!options.allowDangerousCommands && DANGEROUS_COMMANDS.has(commandBasename)) {
    const errorMsg =
      `Command '${commandBasename}' is not allowed. This command can be used for arbitrary ` +
      `code execution. If you trust this MCP server, add the --trust flag when configuring it.`;

    logCommandBlocked(command, errorMsg, options.serverName);

    throw new CommandValidationError(
      ValidationErrorType.DANGEROUS_COMMAND,
      errorMsg,
      command,
    );
  }

  // Validate dangerous argument patterns (--eval, -c, etc.)
  validateArguments(command, args, {
    trusted: options.trusted,
    serverName: options.serverName,
  });

  // Check for shell injection patterns in command
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new CommandValidationError(
        ValidationErrorType.SHELL_INJECTION,
        `Command '${command}' contains dangerous shell metacharacters. ` +
          `If you trust this MCP server, add the --trust flag when configuring it.`,
        command,
      );
    }
  }

  // Check for shell injection patterns in arguments
  for (const arg of args) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        throw new CommandValidationError(
          ValidationErrorType.SHELL_INJECTION,
          `Argument '${arg}' contains dangerous shell metacharacters. ` +
            `If you trust this MCP server, add the --trust flag when configuring it.`,
          command,
        );
      }
    }
  }

  // Require absolute paths for better security
  if (options.requireAbsolutePath && !path.isAbsolute(command)) {
    throw new CommandValidationError(
      ValidationErrorType.ABSOLUTE_PATH_REQUIRED,
      `Command must be an absolute path. Got: '${command}'. ` +
        `Use an absolute path like '/usr/local/bin/my-mcp-server' or ` +
        `add the --trust flag if you trust this server.`,
      command,
    );
  }

  // If absolute path provided, verify it exists and is executable
  if (path.isAbsolute(command)) {
    if (!fs.existsSync(command)) {
      throw new CommandValidationError(
        ValidationErrorType.FILE_NOT_FOUND,
        `Command file not found: '${command}'`,
        command,
      );
    }

    try {
      fs.accessSync(command, fs.constants.X_OK);
    } catch {
      throw new CommandValidationError(
        ValidationErrorType.NOT_EXECUTABLE,
        `Command file is not executable: '${command}'`,
        command,
      );
    }
  }
}

/**
 * Validates environment variables to prevent injection attacks.
 *
 * @param env Environment variables to validate
 * @param serverName Optional server name for audit logging
 * @throws CommandValidationError if validation fails
 */
export function validateEnvironment(
  env: Record<string, string>,
  serverName?: string,
): void {
  const dangerousEnvVars = new Set([
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'NODE_OPTIONS',
    'PYTHON_PATH',
  ]);

  for (const [key, value] of Object.entries(env)) {
    // Check for dangerous environment variable names
    if (dangerousEnvVars.has(key)) {
      logEnvironmentInjectionBlocked(key, serverName);

      throw new CommandValidationError(
        ValidationErrorType.DANGEROUS_COMMAND,
        `Environment variable '${key}' is not allowed as it can be used for code injection.`,
      );
    }

    // Check for shell injection in values
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        logEnvironmentInjectionBlocked(
          `${key} (shell injection in value)`,
          serverName,
        );

        throw new CommandValidationError(
          ValidationErrorType.SHELL_INJECTION,
          `Environment variable '${key}' value contains dangerous shell metacharacters.`,
        );
      }
    }
  }
}

/**
 * Sanitizes a path to prevent path traversal attacks.
 *
 * @param inputPath Path to sanitize
 * @param baseDir Base directory to resolve against
 * @param serverName Optional server name for audit logging
 * @returns Sanitized absolute path
 * @throws CommandValidationError if path traversal is detected
 */
export function validatePath(
  inputPath: string,
  baseDir: string,
  serverName?: string,
): string {
  const resolvedPath = path.resolve(baseDir, inputPath);
  const normalizedBase = path.normalize(baseDir);

  // Ensure the resolved path is within the base directory
  if (!resolvedPath.startsWith(normalizedBase)) {
    logPathTraversalBlocked(inputPath, serverName);

    throw new CommandValidationError(
      ValidationErrorType.PATH_TRAVERSAL,
      `Path traversal detected: '${inputPath}' resolves outside base directory.`,
    );
  }

  return resolvedPath;
}
