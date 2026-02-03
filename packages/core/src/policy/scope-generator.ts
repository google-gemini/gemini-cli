/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalScope } from '../tools/tools.js';
import { buildArgsPatterns } from './utils.js';

/**
 * Command intent classification for security restrictions only.
 * Used to determine if a command should be restricted to exact-only scope.
 */
export type CommandIntent =
  | 'network'
  | 'destructive'
  | 'system-admin'
  | 'interpreter'
  | 'unknown';

/**
 * Result of command classification.
 */
export interface CommandClassification {
  intent: CommandIntent;
  confidence: number;
  source: 'heuristic' | 'none';
}

/**
 * A scope option presented to the user during approval.
 */
export interface ScopeOption {
  /** Unique identifier for this scope */
  id: ApprovalScope;
  /** Human-readable label shown in UI */
  label: string;
  /** Optional description with more details */
  description?: string;
  /** The regex pattern that will be saved to policy */
  pattern: string;
  /** Whether this option is recommended (highlighted in UI) */
  recommended?: boolean;
  /** Whether this option is disabled (for dangerous commands) */
  disabled?: boolean;
  /** The prefix string used for policy matching */
  prefix: string;
}

/**
 * Commands that should only allow exact scope (too dangerous for broad approval).
 * These are security-critical restrictions to prevent accidental damage.
 */
const EXACT_ONLY_COMMANDS = new Set([
  // Interpreters - can execute arbitrary code
  'node',
  'nodejs',
  'python',
  'python3',
  'python2',
  'ruby',
  'perl',
  'php',
  'lua',
  'java',
  'javac',
  'go',
  'rustc',
  'gcc',
  'g++',
  'clang',
  'clang++',
  'make',
  'cmake',
  // Destructive file operations
  'rm',
  'rmdir',
  'mv',
  'shred',
  // Permission changes
  'chmod',
  'chown',
  'chgrp',
  // Privilege escalation
  'sudo',
  'su',
  'doas',
  'pkexec',
  // Network - data exfiltration risk
  'curl',
  'wget',
  'nc',
  'netcat',
  'ncat',
  'socat',
  'ssh',
  'scp',
  'rsync',
  'sftp',
  'ftp',
  // Shell execution
  'eval',
  'exec',
  'source',
  'bash',
  'sh',
  'zsh',
  'fish',
  // System operations
  'dd',
  'mkfs',
  'fdisk',
  'parted',
  'mount',
  'umount',
  'kill',
  'killall',
  'pkill',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'systemctl',
  'service',
]);

/**
 * Extracts the binary name from a command string.
 * Handles paths like /usr/bin/ls -> ls
 */
export function extractBinary(command: string): string {
  const trimmed = command.trim();
  const firstToken = trimmed.split(/\s+/)[0] || '';
  const binary = firstToken.split('/').pop() || firstToken;
  return binary.toLowerCase();
}

/**
 * Extracts subcommand levels from a command string.
 * Skips flags (tokens starting with -) and returns up to maxDepth tokens.
 * For scope generation, stops at argument-like tokens to avoid overly-specific scopes.
 *
 * Examples:
 * - "gh pr view 18183 --json body" -> ["gh", "pr", "view"]
 * - "git rev-parse --abbrev-ref HEAD" -> ["git", "rev-parse"]
 * - "ls -la /foo" -> ["ls", "/foo"]
 * - "kubectl get pods -n default" -> ["kubectl", "get", "pods"]
 */
export function getSubcommandLevels(
  command: string,
  maxDepth: number = 3,
): string[] {
  const tokens = command.trim().split(/\s+/);
  const levels: string[] = [];

  for (const token of tokens) {
    // Skip flags
    if (token.startsWith('-')) continue;

    // Check maxDepth BEFORE adding
    if (levels.length >= maxDepth) break;

    // For the first token (binary), normalize paths
    if (levels.length === 0) {
      const normalized = token.split('/').pop()?.toLowerCase() || token;
      levels.push(normalized);
      continue;
    }

    // Stop at argument-like tokens (after we have at least binary + 1 token)
    // This prevents overly-specific scopes like "gh pr view 18183"
    // But allows subcommands like "kubectl get pods"
    if (levels.length >= 2) {
      // Arguments are typically: pure numbers, all-caps refs
      if (
        /^\d+$/.test(token) || // Pure numbers (e.g., "18183", "443")
        (token === token.toUpperCase() &&
          token.length > 1 &&
          /^[A-Z_]+$/.test(token)) // All-caps (e.g., "HEAD", "FETCH_HEAD")
      ) {
        break;
      }
    }

    levels.push(token.toLowerCase());
  }

  return levels;
}

/**
 * Checks if flags contain recursive options (dangerous for rm).
 */
function hasRecursiveFlag(command: string): boolean {
  const tokens = command.trim().split(/\s+/);
  const recursivePatterns = [
    '-r',
    '-R',
    '-rf',
    '-fr',
    '-Rf',
    '-fR',
    '--recursive',
  ];

  for (const token of tokens) {
    if (recursivePatterns.includes(token)) return true;
    // Check for combined flags like -rf, -fr
    if (
      token.startsWith('-') &&
      !token.startsWith('--') &&
      token.toLowerCase().includes('r')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Classifies a shell command for security restrictions only.
 * Returns the type of dangerous command, or 'unknown' for safe/unclassified commands.
 */
export function classifyCommand(command: string): CommandClassification {
  const binary = extractBinary(command);

  // Exact-only commands get classified by their risk type
  if (EXACT_ONLY_COMMANDS.has(binary)) {
    const intent: CommandIntent = ['rm', 'rmdir', 'shred'].includes(binary)
      ? 'destructive'
      : ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp'].includes(binary)
        ? 'network'
        : ['sudo', 'su', 'doas'].includes(binary)
          ? 'system-admin'
          : [
                'node',
                'python',
                'python3',
                'ruby',
                'perl',
                'bash',
                'sh',
              ].includes(binary)
            ? 'interpreter'
            : 'unknown';

    return { intent, confidence: 1.0, source: 'heuristic' };
  }

  // All other commands are unknown (not dangerous)
  return { intent: 'unknown', confidence: 0, source: 'none' };
}

/**
 * Determines if approval should be persisted (saved to TOML file).
 * Currently returns false - all approvals are session-only by default.
 * This provides better security by requiring re-approval across sessions.
 */
export function shouldPersist(_command: string): boolean {
  return false;
}

/**
 * Checks if a command should only allow exact scope approval.
 */
export function isExactOnly(command: string): boolean {
  const binary = extractBinary(command);
  return EXACT_ONLY_COMMANDS.has(binary);
}

export interface ParsedCommand {
  binary: string;
  subcommand?: string;
  flags: string[];
  args: string[];
}

/**
 * Legacy parseCommand for backward compatibility with policy handler.
 */
export function parseCommand(command: string): ParsedCommand {
  const tokens = command.trim().split(/\s+/);
  const binary = extractBinary(tokens[0] || '');
  const flags: string[] = [];
  const args: string[] = [];
  let subcommand: string | undefined;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      flags.push(token);
    } else if (!subcommand) {
      subcommand = token.toLowerCase();
    } else {
      args.push(token);
    }
  }

  return { binary, subcommand, flags, args };
}

/**
 * Generates dynamic scope options based on command tokens.
 * Creates hierarchical scopes from most specific (exact) to broadest (binary only).
 *
 * For "gh pr view 18183 --json body":
 * - exact: "gh pr view 18183 --json body"
 * - level3: "gh pr view" (any arguments)
 * - level2: "gh pr" (any arguments)
 * - level1: "gh" (any arguments)
 */
export function generateScopeOptions(command: string): ScopeOption[] {
  const options: ScopeOption[] = [];
  const binary = extractBinary(command);
  const exactOnly = isExactOnly(command);

  // Always offer exact scope first
  const exactPatterns = buildArgsPatterns(undefined, command, undefined);
  const displayCmd =
    command.length > 50 ? `${command.slice(0, 47)}...` : command;
  options.push({
    id: 'exact',
    label: `Allow '${displayCmd}' exactly`,
    description: `Only matches: ${command}`,
    pattern: exactPatterns[0] || '',
    prefix: command,
  });

  // For exact-only commands, only offer exact (and safe-rm for non-recursive rm)
  if (exactOnly) {
    if (binary === 'rm' && !hasRecursiveFlag(command)) {
      const safeRmRegex =
        '^\\{"command":"rm(?!.*(\\s-[^\\s]*[rR]|\\s--recursive))';
      options.push({
        id: 'command-flags',
        label: `Allow 'rm' (non-recursive only)`,
        description:
          '⚠️ Allows rm for single files. Blocks -r/-R/--recursive flags.',
        pattern: safeRmRegex,
        prefix: 'rm',
      });
    }
    return options;
  }

  // Get subcommand levels (e.g., ["gh", "pr", "view"])
  const levels = getSubcommandLevels(command, 3);

  // Check if command has additional tokens beyond the subcommand levels
  // This includes both arguments and flags
  const allTokens = command.trim().split(/\s+/);
  const nonFlagTokens = allTokens.filter((t) => !t.startsWith('-'));
  const hasAdditionalTokens =
    allTokens.length > nonFlagTokens.length ||
    nonFlagTokens.length > levels.length;

  // Generate scope options from most specific to broadest
  // Skip the most-specific level if it exactly matches the command structure (no additional tokens)
  // Example: "kubectl get pods" with no args → skip "kubectl get pods (any args)", start from "kubectl get"
  // Example: "kubectl get pods -n default" with args → include "kubectl get pods (any args)"
  const startIndex = hasAdditionalTokens
    ? levels.length - 1
    : levels.length - 2;

  for (let i = startIndex; i >= 1; i--) {
    const prefix = levels.slice(0, i + 1).join(' ');
    const prefixPatterns = buildArgsPatterns(undefined, prefix, undefined);

    // Determine scope ID based on level
    const scopeId: ApprovalScope =
      i === levels.length - 1 ? 'command-flags' : 'command-only';

    options.push({
      id: scopeId,
      label: `Allow '${prefix}' (any arguments)`,
      description: `Matches: ${prefix} <anything>`,
      pattern: prefixPatterns[0] || '',
      prefix,
    });
  }

  // Always add binary-only scope if not already added (when levels.length <= 1)
  // Exclude exact scope from check (exact.prefix is the full command, not binary)
  const hasBinaryScope = options.some(
    (opt) => opt.id !== 'exact' && opt.prefix === binary,
  );
  if (!hasBinaryScope) {
    const binaryPatterns = buildArgsPatterns(undefined, binary, undefined);
    options.push({
      id: 'command-only',
      label: `Allow '${binary}' (any arguments)`,
      description: `Matches any ${binary} command`,
      pattern: binaryPatterns[0] || '',
      prefix: binary,
    });
  }

  return options;
}

/**
 * Gets the recommended scope for a command using simple heuristics.
 * Does not rely on command classification - works for any command.
 */
export function getRecommendedScope(command: string): ApprovalScope {
  // Dangerous commands: always recommend exact
  if (isExactOnly(command)) {
    return 'exact';
  }

  // Commands with subcommands: recommend command-flags (e.g., "gh pr" for "gh pr view 123")
  // This is safer than command-only while still being flexible
  const levels = getSubcommandLevels(command, 3);
  if (levels.length > 1) {
    return 'command-flags';
  }

  // Simple commands (just binary): recommend command-only (e.g., "ls" for "ls -la")
  return 'command-only';
}
