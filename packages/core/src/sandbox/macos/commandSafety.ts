/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { parse as shellParse } from 'shell-quote';
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if a command with its arguments is known to be safe to execute.
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

      const commands = script.split(/&&|\|\||\||;/);

      let allSafe = true;
      for (const cmd of commands) {
        const trimmed = cmd.trim();
        if (!trimmed) continue;

        const parsed = shellParse(trimmed).map(String);
        if (parsed.length === 0) continue;

        if (!isSafeToCallWithExec(parsed)) {
          allSafe = false;
          break;
        }
      }

      if (allSafe && commands.length > 0) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function isSafeToCallWithExec(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  const cmd = args[0];

  const safeCommands = new Set([
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

function gitHasConfigOverrideGlobalOption(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === '-c' ||
      arg === '--config-env' ||
      (arg.startsWith('-c') && arg.length > 2) ||
      arg.startsWith('--config-env='),
  );
}

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
 * Checks if a command with its arguments is known to be dangerous to execute.
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
