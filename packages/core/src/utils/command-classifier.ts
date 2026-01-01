/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command risk categories for granular permission control.
 *
 * - 'read-only': Commands that only read state, no side effects
 * - 'write': Commands that modify local state but are reversible
 * - 'destructive': Commands that can cause data loss or affect remote systems
 */
export type CommandCategory = 'read-only' | 'write' | 'destructive';

/**
 * Git subcommands categorized by their risk level.
 *
 * Based on git documentation and common usage patterns.
 * Commands not listed default to 'write' for safety.
 */
const GIT_SUBCOMMAND_CATEGORIES: Record<string, CommandCategory> = {
  // Read-only: Only inspect state, no modifications
  status: 'read-only',
  log: 'read-only',
  diff: 'read-only',
  show: 'read-only',
  branch: 'read-only', // without -d/-D, just lists
  tag: 'read-only', // without -d, just lists
  remote: 'read-only', // without add/remove, just lists
  // Note: 'stash' is categorized as 'write' below since 'git stash' saves state
  'ls-files': 'read-only',
  'ls-tree': 'read-only',
  'ls-remote': 'read-only',
  'cat-file': 'read-only',
  'rev-parse': 'read-only',
  'rev-list': 'read-only',
  describe: 'read-only',
  shortlog: 'read-only',
  blame: 'read-only',
  annotate: 'read-only',
  grep: 'read-only',
  config: 'read-only', // 'config --get' is read-only
  help: 'read-only',
  version: 'read-only',
  reflog: 'read-only',
  fsck: 'read-only',
  'count-objects': 'read-only',
  'verify-pack': 'read-only',
  'name-rev': 'read-only',
  'merge-base': 'read-only',
  whatchanged: 'read-only',
  'for-each-ref': 'read-only',
  'check-ignore': 'read-only',
  'check-attr': 'read-only',

  // Write: Modify local state, generally reversible
  add: 'write',
  commit: 'write',
  checkout: 'write',
  switch: 'write',
  restore: 'write',
  merge: 'write',
  rebase: 'write',
  'cherry-pick': 'write',
  revert: 'write',
  stash: 'write', // 'stash push/save' modifies state
  apply: 'write',
  am: 'write',
  'format-patch': 'write',
  init: 'write',
  clone: 'write',
  mv: 'write',
  rm: 'write',
  bisect: 'write',
  worktree: 'write',
  submodule: 'write',
  notes: 'write',
  'sparse-checkout': 'write',

  // Destructive: Can cause data loss or affect remote
  push: 'destructive',
  reset: 'destructive', // especially --hard
  clean: 'destructive', // removes untracked files
  gc: 'destructive', // garbage collection, can remove objects
  prune: 'destructive',
  'filter-branch': 'destructive', // rewrites history
  'filter-repo': 'destructive',
  'reflog expire': 'destructive',
  'reflog delete': 'destructive',
  'update-ref': 'destructive',
  replace: 'destructive',
};

/**
 * Commands that are inherently destructive regardless of arguments.
 * These should always require confirmation.
 */
const DESTRUCTIVE_COMMANDS: Set<string> = new Set([
  // File system destructive operations
  'rm',
  'rmdir',
  'del', // Windows
  'rd', // Windows rmdir
  'shred',
  'srm', // secure remove

  // Permission changes that could lock out
  'chmod',
  'chown',
  'chgrp',

  // Disk/partition operations
  'mkfs',
  'fdisk',
  'parted',
  'dd',

  // System operations
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init',
  'systemctl',

  // Package managers with system-level access (can break system)
  'apt-get',
  'apt',
  'yum',
  'dnf',
  'pacman',
  // Note: npm, pip, brew are not included by default as they typically
  // modify local project dependencies. Users can add them to blocklist
  // if needed for their use case.

  // Database operations
  'dropdb',
  'drop',
  'truncate',

  // Container/cloud operations
  'docker',
  'kubectl',
  'terraform',

  // Network operations that modify state
  'iptables',
  'ufw',
  'firewall-cmd',
]);

/**
 * Commands that are always read-only.
 */
const READ_ONLY_COMMANDS: Set<string> = new Set([
  // File viewing
  'cat',
  'less',
  'more',
  'head',
  'tail',
  'bat',

  // Directory listing
  'ls',
  'dir',
  'tree',
  'find',
  'fd',
  'locate',

  // Text processing (read-only)
  'grep',
  'rg', // ripgrep
  'ag', // silver searcher
  'ack',
  'wc',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed', // can be destructive with -i, but usually piped

  // File information
  'file',
  'stat',
  'du',
  'df',
  'lsof',

  // Process information
  'ps',
  'top',
  'htop',
  'pgrep',

  // System information
  'uname',
  'hostname',
  'whoami',
  'id',
  'date',
  'uptime',
  'free',
  'vmstat',

  // Network information
  'ping',
  'traceroute',
  'nslookup',
  'dig',
  'host',
  'netstat',
  'ss',
  'ifconfig',
  'ip',
  'curl', // usually read-only, but can POST
  'wget', // downloads but doesn't modify system state

  // Version/help
  'man',
  'info',
  'help',
  'which',
  'where',
  'type',
  'command',

  // Misc read-only
  'echo',
  'printf',
  'env',
  'printenv',
  'pwd',
  'realpath',
  'dirname',
  'basename',
]);

/**
 * Extracts the git subcommand from a command string.
 * Handles common patterns like 'git status', 'git --no-pager log', etc.
 *
 * @param commandText The full command text (after 'git')
 * @returns The subcommand name or undefined
 */
function extractGitSubcommand(commandText: string): string | undefined {
  // Remove 'git' prefix and trim
  let text = commandText.replace(/^git\s+/, '').trim();

  // Skip common git global options
  const globalOptions = [
    '--no-pager',
    '--paginate',
    '-p',
    '--git-dir',
    '--work-tree',
    '--namespace',
    '-c',
    '-C',
    '--exec-path',
    '--html-path',
    '--man-path',
    '--info-path',
    '--bare',
    '--no-replace-objects',
    '--literal-pathspecs',
    '--glob-pathspecs',
    '--noglob-pathspecs',
    '--icase-pathspecs',
  ];

  // Keep removing global options until we hit a subcommand
  let foundSubcommand = false;
  while (!foundSubcommand && text.length > 0) {
    let matched = false;

    for (const opt of globalOptions) {
      if (text.startsWith(opt)) {
        text = text.substring(opt.length).trim();
        // Handle options with values like -C <path> or --git-dir=<path>
        if (text.startsWith('=')) {
          // Skip the value after =
          const spaceIdx = text.indexOf(' ');
          text = spaceIdx > 0 ? text.substring(spaceIdx).trim() : '';
        } else if (
          ['-c', '-C', '--git-dir', '--work-tree'].includes(opt) &&
          text.length > 0 &&
          !text.startsWith('-')
        ) {
          // Skip the next word (value)
          const spaceIdx = text.indexOf(' ');
          text = spaceIdx > 0 ? text.substring(spaceIdx).trim() : '';
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      foundSubcommand = true;
    }
  }

  // Extract the subcommand (first word)
  const match = text.match(/^([a-z-]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Check if a git command has destructive flags.
 */
function hasDestructiveGitFlags(
  subcommand: string,
  commandText: string,
): boolean {
  const lowerText = commandText.toLowerCase();

  switch (subcommand) {
    case 'reset':
      // 'git reset --hard' is destructive, 'git reset --soft' is not
      return lowerText.includes('--hard') || lowerText.includes('--merge');

    case 'checkout':
      // 'git checkout -f' or '--force' is destructive
      return (
        lowerText.includes('--force') ||
        lowerText.includes(' -f ') ||
        lowerText.includes(' -f\n') ||
        lowerText.endsWith(' -f')
      );

    case 'clean':
      // 'git clean' is always destructive
      return true;

    case 'branch':
      // 'git branch -d' or '-D' deletes branches
      return (
        lowerText.includes(' -d ') ||
        lowerText.includes(' -D ') ||
        lowerText.includes(' --delete')
      );

    case 'tag':
      // 'git tag -d' deletes tags
      return lowerText.includes(' -d ') || lowerText.includes(' --delete');

    case 'stash':
      // 'git stash drop' or 'clear' is destructive
      return lowerText.includes(' drop') || lowerText.includes(' clear');

    case 'push':
      // All push operations are destructive (affect remote)
      // But --force is especially dangerous
      return true;

    case 'rebase':
      // Interactive rebase can rewrite history
      return lowerText.includes(' -i') || lowerText.includes(' --interactive');

    case 'config':
      // 'git config --unset' or setting values modifies config
      return !lowerText.includes(' --get') && !lowerText.includes(' --list');

    case 'remote':
      // 'git remote add/remove' modifies remotes
      return (
        lowerText.includes(' add ') ||
        lowerText.includes(' remove ') ||
        lowerText.includes(' rm ') ||
        lowerText.includes(' rename ') ||
        lowerText.includes(' set-url ')
      );

    default:
      return false;
  }
}

/**
 * Classifies a git command based on its subcommand and flags.
 */
function classifyGitCommand(commandText: string): CommandCategory {
  const subcommand = extractGitSubcommand(commandText);

  if (!subcommand) {
    // Can't determine subcommand, default to 'write' for safety
    return 'write';
  }

  // Check for destructive flags first
  if (hasDestructiveGitFlags(subcommand, commandText)) {
    return 'destructive';
  }

  // Look up base category
  const baseCategory = GIT_SUBCOMMAND_CATEGORIES[subcommand];

  if (baseCategory) {
    return baseCategory;
  }

  // Unknown subcommand, default to 'write' for safety
  return 'write';
}

/**
 * Check if an rm command is destructive based on flags.
 */
function classifyRmCommand(commandText: string): CommandCategory {
  const lowerText = commandText.toLowerCase();

  // rm -rf, rm -r, rm --recursive are especially destructive
  if (
    lowerText.includes(' -rf') ||
    lowerText.includes(' -fr') ||
    lowerText.includes(' -r ') ||
    lowerText.includes(' --recursive')
  ) {
    return 'destructive';
  }

  // rm with force
  if (lowerText.includes(' -f ') || lowerText.includes(' --force')) {
    return 'destructive';
  }

  // Any rm is destructive
  return 'destructive';
}

/**
 * Classifies a shell command based on its root command and arguments.
 *
 * @param rootCommand The root command name (e.g., 'git', 'rm', 'ls')
 * @param fullCommandText The full command text for context
 * @returns The command category
 */
export function classifyCommand(
  rootCommand: string,
  fullCommandText: string,
): CommandCategory {
  const lowerRoot = rootCommand.toLowerCase();

  // Handle git specially due to subcommand complexity
  if (lowerRoot === 'git') {
    return classifyGitCommand(fullCommandText);
  }

  // Handle rm specially
  if (lowerRoot === 'rm' || lowerRoot === 'del') {
    return classifyRmCommand(fullCommandText);
  }

  // Check against known categories
  if (READ_ONLY_COMMANDS.has(lowerRoot)) {
    return 'read-only';
  }

  if (DESTRUCTIVE_COMMANDS.has(lowerRoot)) {
    return 'destructive';
  }

  // Default to 'write' for unknown commands (safer than 'read-only')
  return 'write';
}

/**
 * Checks if a command should bypass session allowlist and require confirmation.
 * This is the main entry point for granular permission checks.
 *
 * @param rootCommand The root command name
 * @param fullCommandText The full command text
 * @returns true if the command is destructive and should require confirmation
 */
export function isDestructiveCommand(
  rootCommand: string,
  fullCommandText: string,
): boolean {
  return classifyCommand(rootCommand, fullCommandText) === 'destructive';
}

/**
 * Gets a user-friendly description of the command category.
 */
export function getCategoryDescription(category: CommandCategory): string {
  switch (category) {
    case 'read-only':
      return 'Read-only operation';
    case 'write':
      return 'Modifies local state';
    case 'destructive':
      return 'Potentially destructive operation';
    default: {
      // Exhaustive check - this should never happen
      const exhaustiveCheck: never = category;
      return exhaustiveCheck;
    }
  }
}

/**
 * Gets a warning message for destructive commands.
 */
export function getDestructiveWarning(
  rootCommand: string,
  fullCommandText: string,
): string | undefined {
  const category = classifyCommand(rootCommand, fullCommandText);

  if (category !== 'destructive') {
    return undefined;
  }

  const lowerRoot = rootCommand.toLowerCase();

  if (lowerRoot === 'git') {
    const subcommand = extractGitSubcommand(fullCommandText);
    if (subcommand === 'push') {
      return '⚠️ This command will push changes to a remote repository';
    }
    if (subcommand === 'reset' && fullCommandText.includes('--hard')) {
      return '⚠️ This command will discard local changes permanently';
    }
    if (subcommand === 'clean') {
      return '⚠️ This command will remove untracked files';
    }
    return '⚠️ This is a destructive git operation';
  }

  if (lowerRoot === 'rm') {
    return '⚠️ This command will delete files';
  }

  return '⚠️ This is a potentially destructive operation';
}
