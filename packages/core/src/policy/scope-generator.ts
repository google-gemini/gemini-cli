/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApprovalScope } from '../tools/tools.js';
import { buildArgsPatterns } from './utils.js';

/**
 * Command intent classification for determining approval behavior.
 */
export type CommandIntent =
  | 'read-only'
  | 'write'
  | 'network'
  | 'destructive'
  | 'system-admin'
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
}

/**
 * Commands that are classified as read-only (safe to approve broadly).
 */
const READ_ONLY_COMMANDS: Record<string, boolean> = {
  // File listing
  ls: true,
  dir: true,
  tree: true,
  find: true,
  locate: true,
  which: true,
  whereis: true,
  file: true,
  stat: true,

  // File reading
  cat: true,
  head: true,
  tail: true,
  less: true,
  more: true,
  bat: true,

  // Text processing (read-only)
  grep: true,
  rg: true,
  ag: true,
  ack: true,
  wc: true,
  sort: true,
  uniq: true,
  diff: true,
  comm: true,

  // System info
  pwd: true,
  whoami: true,
  hostname: true,
  uname: true,
  date: true,
  uptime: true,
  df: true,
  du: true,
  free: true,
  top: true,
  htop: true,
  ps: true,
  env: true,
  printenv: true,
  echo: true,
  printf: true,

  // Development tools (read-only)
  node: true, // Often used for version checks
  python: true, // Often used for version checks
  ruby: true,
  java: true,
  go: true,
  rustc: true,
  cargo: true, // cargo --version, cargo check
  npm: false, // npm install is write
  yarn: false,
  pnpm: false,
  pip: false,
  gem: false,
};

/**
 * Git subcommands classified by intent.
 */
const GIT_SUBCOMMAND_INTENT: Record<string, CommandIntent> = {
  // Read-only
  status: 'read-only',
  diff: 'read-only',
  log: 'read-only',
  show: 'read-only',
  branch: 'read-only',
  tag: 'read-only',
  remote: 'read-only',
  stash: 'read-only', // stash list is read, but stash push is write
  blame: 'read-only',
  shortlog: 'read-only',
  describe: 'read-only',
  rev_parse: 'read-only',
  ls_files: 'read-only',
  ls_tree: 'read-only',
  config: 'read-only', // config --list is read, config --set is write

  // Write operations
  add: 'write',
  commit: 'write',
  push: 'write',
  pull: 'write',
  fetch: 'write',
  merge: 'write',
  rebase: 'write',
  checkout: 'write',
  switch: 'write',
  restore: 'write',
  reset: 'write',
  revert: 'write',
  cherry_pick: 'write',
  clean: 'destructive',
  rm: 'destructive',
};

/**
 * Commands that should only allow exact scope (too dangerous for broad approval).
 */
const EXACT_ONLY_COMMANDS = new Set([
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

  // Network tools (data exfiltration risk)
  'curl',
  'wget',
  'nc',
  'netcat',
  'ncat',
  'socat',

  // Remote access
  'ssh',
  'scp',
  'rsync',
  'sftp',
  'ftp',

  // Code execution
  'eval',
  'exec',
  'source',
  'bash',
  'sh',
  'zsh',
  'fish',

  // Disk operations
  'dd',
  'mkfs',
  'fdisk',
  'parted',
  'mount',
  'umount',

  // Process control
  'kill',
  'killall',
  'pkill',

  // System control
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
  // Handle paths: /usr/bin/ls -> ls
  const binary = firstToken.split('/').pop() || firstToken;
  return binary.toLowerCase();
}

/**
 * Extracts the subcommand for tools like git, npm, etc.
 */
function extractSubcommand(command: string): string | undefined {
  const tokens = command.trim().split(/\s+/);
  if (tokens.length < 2) return undefined;
  // Skip flags to find subcommand
  for (let i = 1; i < tokens.length; i++) {
    if (!tokens[i].startsWith('-')) {
      return tokens[i].toLowerCase().replace(/-/g, '_');
    }
  }
  return undefined;
}

/**
 * Classifies a shell command's intent using heuristics.
 */
export function classifyCommand(command: string): CommandClassification {
  const binary = extractBinary(command);

  // Check for exact-only commands first (always require caution)
  if (EXACT_ONLY_COMMANDS.has(binary)) {
    const intent: CommandIntent =
      binary === 'rm' || binary === 'rmdir' || binary === 'shred'
        ? 'destructive'
        : ['curl', 'wget', 'nc', 'netcat', 'ssh', 'scp'].includes(binary)
          ? 'network'
          : ['sudo', 'su', 'doas'].includes(binary)
            ? 'system-admin'
            : 'write';

    return { intent, confidence: 1.0, source: 'heuristic' };
  }

  // Handle git specially - check subcommand
  if (binary === 'git') {
    const subcommand = extractSubcommand(command);
    if (subcommand && GIT_SUBCOMMAND_INTENT[subcommand]) {
      return {
        intent: GIT_SUBCOMMAND_INTENT[subcommand],
        confidence: 1.0,
        source: 'heuristic',
      };
    }
    // Unknown git subcommand - be cautious
    return { intent: 'write', confidence: 0.7, source: 'heuristic' };
  }

  // Handle package managers - subcommand dependent
  if (['npm', 'yarn', 'pnpm', 'pip', 'gem', 'cargo'].includes(binary)) {
    const subcommand = extractSubcommand(command);
    const readOnlySubcommands = [
      'list',
      'ls',
      'info',
      'view',
      'show',
      'search',
      'outdated',
      'audit',
      'why',
      'explain',
      'help',
      'version',
    ];
    if (subcommand && readOnlySubcommands.includes(subcommand)) {
      return { intent: 'read-only', confidence: 0.9, source: 'heuristic' };
    }
    return { intent: 'write', confidence: 0.8, source: 'heuristic' };
  }

  // Check simple read-only commands
  if (READ_ONLY_COMMANDS[binary]) {
    return { intent: 'read-only', confidence: 0.95, source: 'heuristic' };
  }

  // Unknown command - be cautious
  return { intent: 'unknown', confidence: 0, source: 'none' };
}

/**
 * Determines if approval should be persisted (saved to TOML file)
 * based on command classification.
 */
export function shouldPersist(command: string): boolean {
  const classification = classifyCommand(command);

  // Only persist read-only commands
  // Everything else is session-only for safety
  return (
    classification.intent === 'read-only' && classification.confidence > 0.8
  );
}

/**
 * Checks if a command should only allow exact scope approval.
 */
export function isExactOnly(command: string): boolean {
  const binary = extractBinary(command);
  return EXACT_ONLY_COMMANDS.has(binary);
}

/**
 * Simple command parser that extracts binary, flags, and arguments.
 */
interface ParsedCommand {
  binary: string;
  flags: string[];
  args: string[];
}

function parseCommand(command: string): ParsedCommand {
  const tokens = command.trim().split(/\s+/);
  const binary = extractBinary(tokens[0] || '');
  const flags: string[] = [];
  const args: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      flags.push(token);
    } else {
      args.push(token);
    }
  }

  return { binary, flags, args };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates scope options for a shell command.
 * Returns options in order of specificity (exact -> broad).
 */
export function generateScopeOptions(
  command: string,
  rootCommand: string,
): ScopeOption[] {
  const parts = parseCommand(rootCommand);
  const options: ScopeOption[] = [];
  const classification = classifyCommand(command);
  const exactOnly = isExactOnly(command);

  // Always offer exact scope
  const exactPatterns = buildArgsPatterns(undefined, rootCommand, undefined);
  options.push({
    id: 'exact',
    label: 'Allow exact command only',
    pattern: exactPatterns[0] || `^${escapeRegex(rootCommand)}`,
  });

  // If exact-only command, don't offer broader scopes
  if (exactOnly) {
    return options;
  }

  // Command with flags (if flags present)
  if (parts.flags.length > 0) {
    const cmdWithFlags = `${parts.binary} ${parts.flags.join(' ')}`;
    const flagPatterns = buildArgsPatterns(undefined, cmdWithFlags, undefined);
    options.push({
      id: 'command-flags',
      label: `Allow '${cmdWithFlags}' (any arguments)`,
      description: `Matches: ${cmdWithFlags} <anything>`,
      pattern: flagPatterns[0] || `^${escapeRegex(cmdWithFlags)}\\b`,
    });
  }

  // Command only (any flags, any arguments)
  const binaryPattern = `^${escapeRegex(parts.binary)}\\b`;
  options.push({
    id: 'command-only',
    label: `Allow '${parts.binary}' (any arguments)`,
    description: `Matches any ${parts.binary} command`,
    pattern: binaryPattern,
    recommended: classification.intent === 'read-only',
  });

  return options;
}

/**
 * Gets the default/recommended scope for a command.
 */
export function getRecommendedScope(command: string): ApprovalScope {
  if (isExactOnly(command)) {
    return 'exact';
  }

  const classification = classifyCommand(command);

  // Read-only commands: recommend broad scope
  if (
    classification.intent === 'read-only' &&
    classification.confidence > 0.8
  ) {
    return 'command-only';
  }

  // Write commands: recommend exact or command-flags
  if (classification.intent === 'write') {
    const parts = parseCommand(command);
    return parts.flags.length > 0 ? 'command-flags' : 'exact';
  }

  // Unknown/network/destructive: exact only
  return 'exact';
}
