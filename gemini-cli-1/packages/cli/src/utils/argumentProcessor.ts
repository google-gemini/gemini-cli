/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateAndSanitizeInput, validateCLIArguments } from './securityValidators.js';
import type { LoadedSettings } from '../config/settings.ts';

/**
 * Secure argument processing to prevent prompt injection and command execution vulnerabilities
 */

export interface ProcessedArguments {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
  rawInput: string;
  isSafe: boolean;
  warnings: string[];
}

export interface ArgumentValidationResult {
  valid: boolean;
  sanitized: string;
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Comprehensive argument processor with security validation
 */
export class SecureArgumentProcessor {
  private readonly dangerousPatterns = [
    // Command injection patterns
    /[;&|`$(){}[\]<>\n\r]/,
    /\b(eval|exec|system|spawn|popen|subprocess)\b/i,
    /\$\{.*\}/,
    /`.*`/,

    // Path traversal patterns
    /\.\.[\/\\]/,
    /\/etc\/|\/home\/|\/root\/|\/usr\/|\/var\//,

    // URL/command execution patterns
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,

    // SQL injection patterns (if applicable)
    /('|--|#|\/\*|\*\/)/,

    // XSS patterns
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];

  private readonly suspiciousFlags = [
    '--exec', '--eval', '--shell', '--command',
    '--privileged', '--host', '--network=host',
    '--volume=/', '--volume=/etc', '--volume=/home',
    '-e', '--env', '--environment'
  ];

  /**
   * Processes command-line arguments securely
   */
  processArguments(args: string[], settings: LoadedSettings): ProcessedArguments {
    const warnings: string[] = [];
    let isSafe = true;

    // Parse command and arguments
    const command = args[0] || '';
    const rawArgs = args.slice(1);

    // Validate command
    const commandValidation = this.validateArgument(command, 'command');
    if (!commandValidation.valid) {
      warnings.push(`Invalid command: ${commandValidation.warnings.join(', ')}`);
      isSafe = false;
    }

    // Validate and sanitize arguments
    const validatedArgs: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];

      // Check if it's a flag
      if (arg.startsWith('--') || arg.startsWith('-')) {
        const flagValidation = this.processFlag(arg, rawArgs[i + 1], settings);
        if (!flagValidation.valid) {
          warnings.push(`Invalid flag ${arg}: ${flagValidation.warnings.join(', ')}`);
          isSafe = false;
        } else {
          flags[flagValidation.flagName] = flagValidation.value;
          if (flagValidation.consumedNext) i++; // Skip next argument if it was consumed
        }
      } else {
        // Regular argument
        const argValidation = this.validateArgument(arg, 'argument');
        if (!argValidation.valid) {
          warnings.push(`Invalid argument: ${argValidation.warnings.join(', ')}`);
          isSafe = false;
        }
        validatedArgs.push(argValidation.sanitized);
      }
    }

    // Additional security checks
    const additionalChecks = this.performSecurityChecks(command, validatedArgs, flags);
    warnings.push(...additionalChecks.warnings);
    if (!additionalChecks.safe) {
      isSafe = false;
    }

    return {
      command: commandValidation.sanitized,
      args: validatedArgs,
      flags,
      rawInput: args.join(' '),
      isSafe,
      warnings,
    };
  }

  private validateArgument(arg: string, context: string): ArgumentValidationResult {
    const warnings: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(arg)) {
        warnings.push(`Dangerous pattern detected: ${pattern.source}`);
        riskLevel = 'high';
      }
    }

    // Length validation
    if (arg.length > 1000) {
      warnings.push('Argument too long');
      riskLevel = 'medium';
    }

    // Null byte check
    if (arg.includes('\0')) {
      warnings.push('Null byte detected');
      riskLevel = 'critical';
    }

    // Try to sanitize the input
    try {
      const sanitized = validateAndSanitizeInput(arg, context);
      return {
        valid: warnings.length === 0,
        sanitized: sanitized || arg,
        warnings,
        riskLevel,
      };
    } catch (error) {
      return {
        valid: false,
        sanitized: arg,
        warnings: [...warnings, error instanceof Error ? error.message : String(error)],
        riskLevel: 'critical',
      };
    }
  }

  private processFlag(
    flag: string,
    nextArg: string | undefined,
    settings: LoadedSettings
  ): { valid: boolean; flagName: string; value: string | boolean; consumedNext: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Extract flag name
    const flagName = flag.replace(/^--?/, '');

    // Check for suspicious flags
    if (this.suspiciousFlags.includes(flag)) {
      warnings.push(`Suspicious flag detected: ${flag}`);
    }

    // Check if flag expects a value
    const flagsWithValues = ['--file', '--output', '--input', '--config', '-f', '-o', '-i', '-c'];

    if (flagsWithValues.includes(flag)) {
      if (!nextArg) {
        warnings.push(`Flag ${flag} expects a value but none provided`);
        return {
          valid: false,
          flagName,
          value: false,
          consumedNext: false,
          warnings,
        };
      }

      // Validate the flag value
      const valueValidation = this.validateArgument(nextArg, 'flag-value');
      warnings.push(...valueValidation.warnings);

      return {
        valid: warnings.length === 0,
        flagName,
        value: valueValidation.sanitized,
        consumedNext: true,
        warnings,
      };
    }

    // Boolean flag
    return {
      valid: warnings.length === 0,
      flagName,
      value: true,
      consumedNext: false,
      warnings,
    };
  }

  private performSecurityChecks(
    command: string,
    args: string[],
    flags: Record<string, string | boolean>
  ): { safe: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let safe = true;

    // Check for command chaining
    const combinedInput = [command, ...args].join(' ');
    if (combinedInput.includes('&&') || combinedInput.includes('||') || combinedInput.includes(';')) {
      warnings.push('Command chaining detected');
      safe = false;
    }

    // Check for environment variable injection
    if (combinedInput.includes('$') || combinedInput.includes('${')) {
      warnings.push('Environment variable injection pattern detected');
      safe = false;
    }

    // Check for dangerous file operations
    const dangerousFiles = ['/etc/passwd', '/etc/shadow', '/root/.ssh', '/home/.ssh'];
    for (const file of dangerousFiles) {
      if (combinedInput.includes(file)) {
        warnings.push(`Access to sensitive file detected: ${file}`);
        safe = false;
      }
    }

    // Check for network operations
    if (combinedInput.includes('curl ') || combinedInput.includes('wget ')) {
      warnings.push('Network operation detected in command');
      // This might be acceptable in some contexts, so just warn
    }

    // Check for privilege escalation
    if (combinedInput.includes('sudo ') || combinedInput.includes('su ')) {
      warnings.push('Privilege escalation attempt detected');
      safe = false;
    }

    return { safe, warnings };
  }
}

/**
 * Prompt injection detector and sanitizer
 */
export class PromptInjectionDetector {
  private readonly injectionPatterns = [
    // Direct command injection
    /run.*command/i,
    /execute.*command/i,
    /eval.*code/i,
    /system.*call/i,

    // File operations
    /read.*file/i,
    /write.*file/i,
    /delete.*file/i,
    /create.*file/i,

    // Network operations
    /download.*file/i,
    /upload.*file/i,
    /connect.*to/i,
    /send.*request/i,

    // System operations
    /restart.*system/i,
    /shutdown.*system/i,
    /kill.*process/i,
    /change.*permission/i,

    // Dangerous keywords
    /\b(rm|del|format|sudo|su|chmod|chown|mount)\b/i,
    /\b(curl|wget|ssh|scp|rsync|nc|netcat)\b/i,
    /\b(docker|kubectl|aws|gcloud|az)\b/i,
  ];

  detectInjection(prompt: string): {
    hasInjection: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    detectedPatterns: string[];
    sanitizedPrompt: string;
  } {
    const detectedPatterns: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for injection patterns
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(prompt)) {
        detectedPatterns.push(pattern.source);
        // Escalate risk level based on pattern severity
        if (pattern.source.includes('rm|del|format|sudo')) {
          riskLevel = 'critical';
        } else if (pattern.source.includes('chmod|chown|mount')) {
          riskLevel = riskLevel === 'low' ? 'high' : riskLevel;
        } else {
          riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
        }
      }
    }

    // Sanitize the prompt by removing dangerous content
    let sanitizedPrompt = prompt;
    for (const pattern of this.injectionPatterns) {
      sanitizedPrompt = sanitizedPrompt.replace(pattern, '[FILTERED]');
    }

    return {
      hasInjection: detectedPatterns.length > 0,
      riskLevel,
      detectedPatterns,
      sanitizedPrompt,
    };
  }

  sanitizePrompt(prompt: string, settings: LoadedSettings): string {
    const detection = this.detectInjection(prompt);

    if (detection.hasInjection) {
      // Log the detection
      console.warn(`Prompt injection detected: ${detection.detectedPatterns.join(', ')}`);

      // If strict mode is enabled, reject the prompt entirely
      if (settings.merged.security?.strictPromptValidation) {
        throw new Error(`Prompt injection detected with risk level: ${detection.riskLevel}`);
      }

      return detection.sanitizedPrompt;
    }

    return prompt;
  }
}

/**
 * Command whitelist enforcer
 */
export class CommandWhitelistEnforcer {
  private whitelist: Set<string> = new Set([
    'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
    'npm', 'yarn', 'pnpm', 'git', 'node', 'python', 'python3',
    'echo', 'pwd', 'whoami', 'date', 'uptime'
  ]);

  addToWhitelist(command: string): boolean {
    if (!command || command.length > 50) {
      return false;
    }

    // Validate command name
    if (!/^[a-zA-Z0-9_-]+$/.test(command)) {
      return false;
    }

    this.whitelist.add(command);
    return true;
  }

  isAllowed(command: string): boolean {
    return this.whitelist.has(command);
  }

  getWhitelist(): string[] {
    return Array.from(this.whitelist);
  }

  enforceWhitelist(command: string, args: string[]): {
    allowed: boolean;
    reason?: string;
    sanitizedCommand?: string;
    sanitizedArgs?: string[];
  } {
    if (!this.isAllowed(command)) {
      return {
        allowed: false,
        reason: `Command '${command}' is not in the whitelist`,
      };
    }

    // Additional validation for allowed commands
    const sanitizedArgs = validateCLIArguments(args, {} as any);

    return {
      allowed: true,
      sanitizedCommand: command,
      sanitizedArgs,
    };
  }
}

/**
 * Comprehensive argument processing pipeline
 */
export function createSecureArgumentPipeline(settings: LoadedSettings) {
  const processor = new SecureArgumentProcessor();
  const injectionDetector = new PromptInjectionDetector();
  const whitelistEnforcer = new CommandWhitelistEnforcer();

  return {
    process: (args: string[]) => processor.processArguments(args, settings),
    detectInjection: (prompt: string) => injectionDetector.detectInjection(prompt),
    sanitizePrompt: (prompt: string) => injectionDetector.sanitizePrompt(prompt, settings),
    enforceWhitelist: (command: string, args: string[]) => whitelistEnforcer.enforceWhitelist(command, args),
    addToWhitelist: (command: string) => whitelistEnforcer.addToWhitelist(command),
  };
}
