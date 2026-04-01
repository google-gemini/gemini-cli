/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse as shellParse } from 'shell-quote';
import {
  extractStringFromParseEntry,
  initializeShellParsers,
  splitCommands,
  stripShellWrapper,
} from '../../utils/shell-utils.js';

/**
 * Determines if a command is strictly approved for execution on macOS.
 * A command is approved if it's composed entirely of tools explicitly listed in `approvedTools`
 * OR if it's composed of known safe, read-only POSIX commands.
 *
 * @param command - The full command string to execute.
 * @param args - The arguments for the command.
 * @param approvedTools - A list of explicitly approved tool names (e.g., ['npm', 'git']).
 * @returns true if the command is strictly approved, false otherwise.
 */
export async function isStrictlyApproved(
  command: string,
  args: string[],
  approvedTools?: string[],
): Promise<boolean> {
  const tools = approvedTools ?? [];

  await initializeShellParsers();

  const fullCmd = [command, ...args].join(' ');
  const stripped = stripShellWrapper(fullCmd);

  const pipelineCommands = splitCommands(stripped);

  // Fallback for simple commands or parsing failures
  if (pipelineCommands.length === 0) {
    // For simple commands, we check the root command.
    // If it's explicitly approved OR it's a known safe POSIX command, we allow it.
    return tools.includes(command) || isKnownSafeCommand([command, ...args]);
  }

  // Check every segment of the pipeline
  return pipelineCommands.every((cmdString) => {
    const trimmed = cmdString.trim();
    if (!trimmed) return true;

    const parsedArgs = shellParse(trimmed).map(extractStringFromParseEntry);
    if (parsedArgs.length === 0) return true;

    const root = parsedArgs[0];
    // The segment is approved if the root tool is in the allowlist OR if the whole segment is safe.
    return tools.includes(root) || isKnownSafeCommand(parsedArgs);
  });
}

/**
 * Checks if a command with its arguments is known to be safe to execute
 * without requiring user confirmation. This is primarily used to allow
 * harmless, read-only commands to run silently in the macOS sandbox.
 *
 * It handles raw command execution as well as wrapped commands like `bash -c "..."` or `bash -lc "..."`.
 * For wrapped commands, it parses the script and ensures all individual
 * sub-commands are in the known-safe list and no dangerous shell operators
 * (like subshells or redirection) are used.
 *
 * @param args - The command and its arguments (e.g., ['ls', '-la'])
 * @returns true if the command is considered safe, false otherwise.
 */
export function isKnownSafeCommand(args: string[]): boolean {
  if (!args || args.length === 0) {
    return false;
  }

  // Normalize zsh to bash
  const normalizedArgs = args.map((a) => (a === 'zsh' ? 'bash' : a));

  if (isSafeToCallWithExec(normalizedArgs)) {
    return true;
  }

  // Support `bash -lc "..."`
  if (
    normalizedArgs.length === 3 &&
    normalizedArgs[0] === 'bash' &&
    (normalizedArgs[1] === '-lc' || normalizedArgs[1] === '-c')
  ) {
    try {
      const script = normalizedArgs[2];

      // Basic check for dangerous operators that could spawn subshells or redirect output
      // We allow &&, ||, |, ; but explicitly block subshells () and redirection >, >>, <
      if (/[()<>]/g.test(script)) {
        return false;
      }

      const commands = splitCommands(script);
      if (commands.length === 0) return false;

      return commands.every((cmd) => {
        const trimmed = cmd.trim();
        if (!trimmed) return true;

        const parsed = shellParse(trimmed).map(extractStringFromParseEntry);
        if (parsed.length === 0) return true;

        return isSafeToCallWithExec(parsed);
      });
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Core validation logic that checks a single command and its arguments
 * against an allowlist of known safe operations. It performs deep validation
 * for specific tools like `base64`, `find`, `rg`, `git`, and `sed` to ensure
 * unsafe flags (like `--output`, `-exec`, or mutating options) are not used.
 *
 * @param args - The command and its arguments.
 * @returns true if the command is strictly read-only and safe.
 */
function isSafeToCallWithExec(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  const cmd = args[0];

  const safeCommands = new Set([
    '__read',
    '__write',
    'cat',
    'cd',
    'cut',
    'echo',
    'expr',
    'false',
    'grep',
    'head',
    'id',
    'ls',
    'nl',
    'paste',
    'pwd',
    'rev',
    'seq',
    'stat',
    'tail',
    'tr',
    'true',
    'uname',
    'uniq',
    'wc',
    'which',
    'whoami',
    'numfmt',
    'tac',
  ]);

  if (safeCommands.has(cmd)) {
    return true;
  }

  if (cmd === 'base64') {
    const unsafeOptions = new Set(['-o', '--output']);
    return !args
      .slice(1)
      .some(
        (arg) =>
          unsafeOptions.has(arg) ||
          arg.startsWith('--output=') ||
          (arg.startsWith('-o') && arg !== '-o'),
      );
  }

  if (cmd === 'find') {
    const unsafeOptions = new Set([
      '-exec',
      '-execdir',
      '-ok',
      '-okdir',
      '-delete',
      '-fls',
      '-fprint',
      '-fprint0',
      '-fprintf',
    ]);
    return !args.some((arg) => unsafeOptions.has(arg));
  }

  if (cmd === 'rg') {
    const unsafeWithArgs = new Set(['--pre', '--hostname-bin']);
    const unsafeWithoutArgs = new Set(['--search-zip', '-z']);

    return !args.some((arg) => {
      if (unsafeWithoutArgs.has(arg)) return true;
      for (const opt of unsafeWithArgs) {
        if (arg === opt || arg.startsWith(opt + '=')) return true;
      }
      return false;
    });
  }

  if (cmd === 'git') {
    if (gitHasConfigOverrideGlobalOption(args)) {
      return false;
    }

    const { idx, subcommand } = findGitSubcommand(args, [
      'status',
      'log',
      'diff',
      'show',
      'branch',
    ]);
    if (!subcommand) {
      return false;
    }

    const subcommandArgs = args.slice(idx + 1);

    if (['status', 'log', 'diff', 'show'].includes(subcommand)) {
      return gitSubcommandArgsAreReadOnly(subcommandArgs);
    }

    if (subcommand === 'branch') {
      return (
        gitSubcommandArgsAreReadOnly(subcommandArgs) &&
        gitBranchIsReadOnly(subcommandArgs)
      );
    }

    return false;
  }

  if (cmd === 'sed') {
    // Special-case sed -n {N|M,N}p
    if (args.length <= 4 && args[1] === '-n' && isValidSedNArg(args[2])) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Helper to identify which git subcommand is being executed, skipping over
 * global git options like `-c` or `--git-dir`.
 *
 * @param args - The full git command arguments.
 * @param subcommands - A list of subcommands to look for.
 * @returns An object containing the index of the subcommand and its name.
 */
function findGitSubcommand(
  args: string[],
  subcommands: string[],
): { idx: number; subcommand: string | null } {
  let skipNext = false;

  for (let idx = 1; idx < args.length; idx++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[idx];

    if (
      arg.startsWith('--config-env=') ||
      arg.startsWith('--exec-path=') ||
      arg.startsWith('--git-dir=') ||
      arg.startsWith('--namespace=') ||
      arg.startsWith('--super-prefix=') ||
      arg.startsWith('--work-tree=') ||
      ((arg.startsWith('-C') || arg.startsWith('-c')) && arg.length > 2)
    ) {
      continue;
    }

    if (
      arg === '-C' ||
      arg === '-c' ||
      arg === '--config-env' ||
      arg === '--exec-path' ||
      arg === '--git-dir' ||
      arg === '--namespace' ||
      arg === '--super-prefix' ||
      arg === '--work-tree'
    ) {
      skipNext = true;
      continue;
    }

    if (arg === '--' || arg.startsWith('-')) {
      continue;
    }

    if (subcommands.includes(arg)) {
      return { idx, subcommand: arg };
    }

    return { idx: -1, subcommand: null };
  }

  return { idx: -1, subcommand: null };
}

/**
 * Checks if a git command contains global configuration override flags
 * (e.g., `-c` or `--config-env`) which could be used maliciously to
 * execute arbitrary code via git config.
 *
 * @param args - The git command arguments.
 * @returns true if config overrides are present.
 */
function gitHasConfigOverrideGlobalOption(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === '-c' ||
      arg === '--config-env' ||
      (arg.startsWith('-c') && arg.length > 2) ||
      arg.startsWith('--config-env='),
  );
}

/**
 * Validates that the arguments for safe git subcommands (like `status`, `log`,
 * `diff`, `show`) do not contain flags that could cause mutations or execute
 * arbitrary commands (e.g., `--output`, `--exec`).
 *
 * @param args - Arguments passed to the git subcommand.
 * @returns true if the arguments only represent read-only operations.
 */
function gitSubcommandArgsAreReadOnly(args: string[]): boolean {
  const unsafeFlags = new Set([
    '--output',
    '--ext-diff',
    '--textconv',
    '--exec',
    '--paginate',
  ]);

  return !args.some(
    (arg) =>
      unsafeFlags.has(arg) ||
      arg.startsWith('--output=') ||
      arg.startsWith('--exec='),
  );
}

/**
 * Validates that `git branch` is only used for read operations
 * (e.g., listing branches) rather than creating, deleting, or renaming branches.
 *
 * @param args - Arguments passed to `git branch`.
 * @returns true if it's purely a listing/read-only branch command.
 */
function gitBranchIsReadOnly(args: string[]): boolean {
  if (args.length === 0) return true;

  let sawReadOnlyFlag = false;
  for (const arg of args) {
    if (
      [
        '--list',
        '-l',
        '--show-current',
        '-a',
        '--all',
        '-r',
        '--remotes',
        '-v',
        '-vv',
        '--verbose',
      ].includes(arg)
    ) {
      sawReadOnlyFlag = true;
    } else if (arg.startsWith('--format=')) {
      sawReadOnlyFlag = true;
    } else {
      return false;
    }
  }
  return sawReadOnlyFlag;
}

/**
 * Ensures that a `sed` command argument is a valid line-printing instruction
 * (e.g., `10p` or `5,10p`), preventing unsafe script execution in `sed`.
 *
 * @param arg - The script argument passed to `sed -n`.
 * @returns true if it's a valid, safe print command.
 */
function isValidSedNArg(arg: string | undefined): boolean {
  if (!arg) return false;

  if (!arg.endsWith('p')) return false;
  const core = arg.slice(0, -1);

  const parts = core.split(',');
  if (parts.length === 1) {
    const num = parts[0];
    return num.length > 0 && /^\d+$/.test(num);
  } else if (parts.length === 2) {
    const a = parts[0];
    const b = parts[1];
    return a.length > 0 && b.length > 0 && /^\d+$/.test(a) && /^\d+$/.test(b);
  }

  return false;
}

/**
 * Checks if a command with its arguments is explicitly known to be dangerous
 * and should be blocked or require strict user confirmation. This catches
 * destructive commands like `rm -rf`, `sudo`, and commands with execution
 * flags like `find -exec`.
 *
 * @param args - The command and its arguments.
 * @returns true if the command is identified as dangerous, false otherwise.
 */
export function isDangerousCommand(args: string[]): boolean {
  if (!args || args.length === 0) {
    return false;
  }

  const cmd = args[0];

  if (cmd === 'rm') {
    return args[1] === '-f' || args[1] === '-rf' || args[1] === '-fr';
  }

  if (cmd === 'sudo') {
    return isDangerousCommand(args.slice(1));
  }

  if (cmd === 'find') {
    const unsafeOptions = new Set([
      '-exec',
      '-execdir',
      '-ok',
      '-okdir',
      '-delete',
      '-fls',
      '-fprint',
      '-fprint0',
      '-fprintf',
    ]);
    return args.some((arg) => unsafeOptions.has(arg));
  }

  if (cmd === 'rg') {
    const unsafeWithArgs = new Set(['--pre', '--hostname-bin']);
    const unsafeWithoutArgs = new Set(['--search-zip', '-z']);

    return args.some((arg) => {
      if (unsafeWithoutArgs.has(arg)) return true;
      for (const opt of unsafeWithArgs) {
        if (arg === opt || arg.startsWith(opt + '=')) return true;
      }
      return false;
    });
  }

  if (cmd === 'git') {
    if (gitHasConfigOverrideGlobalOption(args)) {
      return true;
    }

    const { idx, subcommand } = findGitSubcommand(args, [
      'status',
      'log',
      'diff',
      'show',
      'branch',
    ]);
    if (!subcommand) {
      // It's a git command we don't recognize as explicitly safe.
      return false;
    }

    const subcommandArgs = args.slice(idx + 1);

    if (['status', 'log', 'diff', 'show'].includes(subcommand)) {
      return !gitSubcommandArgsAreReadOnly(subcommandArgs);
    }

    if (subcommand === 'branch') {
      return !(
        gitSubcommandArgsAreReadOnly(subcommandArgs) &&
        gitBranchIsReadOnly(subcommandArgs)
      );
    }

    return false;
  }

  if (cmd === 'base64') {
    const unsafeOptions = new Set(['-o', '--output']);
    return args
      .slice(1)
      .some(
        (arg) =>
          unsafeOptions.has(arg) ||
          arg.startsWith('--output=') ||
          (arg.startsWith('-o') && arg !== '-o'),
      );
  }

  return false;
}
