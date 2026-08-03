/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { quote, parse, type ParseEntry } from 'shell-quote';
import {
  parse as parseBash,
  type ArithmeticExpression,
  type Command as BashCommand,
  type Node as BashNode,
  type Redirect,
  type TestExpression,
  type Word,
  type WordPart,
} from 'unbash';
import {
  spawn,
  spawnSync,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';

/**
 * Extracts the primary command name from a potentially wrapped shell command.
 * Strips shell wrappers and handles shopt/set/etc.
 *
 * @param command - The full command string.
 * @param args - The arguments for the command.
 * @returns The primary command name.
 */
export async function getCommandName(
  command: string,
  args: string[],
): Promise<string> {
  const fullCmd = [command, ...args].join(' ');
  const stripped = stripShellWrapper(fullCmd);
  const roots = getCommandRoots(stripped).filter(
    (r) => r !== 'shopt' && r !== 'set',
  );
  if (roots.length > 0) {
    return roots[0];
  }
  return path.basename(command);
}

/**
 * Extracts a string representation from a shell-quote ParseEntry.
 */
export function extractStringFromParseEntry(entry: ParseEntry): string {
  if (typeof entry === 'string') return entry;
  if ('pattern' in entry) return entry.pattern;
  if ('op' in entry) return entry.op;
  if ('comment' in entry) return ''; // We can typically ignore comments for safety checks
  return '';
}
import * as readline from 'node:readline';
import { debugLogger } from './debugLogger.js';
import type { SandboxManager } from '../services/sandboxManager.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';

export const SHELL_TOOL_NAMES = ['run_shell_command', 'ShellTool'];

/**
 * An identifier for the shell type.
 */
export type ShellType = 'cmd' | 'powershell' | 'bash';

/**
 * Defines the configuration required to execute a command string within a specific shell.
 */
export interface ShellConfiguration {
  /** The path or name of the shell executable (e.g., 'bash', 'powershell.exe'). */
  executable: string;
  /**
   * The arguments required by the shell to execute a subsequent string argument.
   */
  argsPrefix: string[];
  /** An identifier for the shell type. */
  shell: ShellType;
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveExecutable(exe: string): string | undefined {
  if (path.isAbsolute(exe)) {
    return isExecutable(exe) ? exe : undefined;
  }
  const pathEnv = process.env['PATH'];
  if (!pathEnv) {
    return undefined;
  }
  const extensions =
    os.platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, exe + ext);
      if (isExecutable(fullPath)) {
        return fullPath;
      }
    }
  }
  return undefined;
}

export interface ParsedCommandDetail {
  name: string;
  text: string;
  startIndex: number;
  args?: string[];
}

interface CommandParseResult {
  details: ParsedCommandDetail[];
  hasError: boolean;
  hasRedirection?: boolean;
}

const POWERSHELL_COMMAND_ENV = '__GCLI_POWERSHELL_COMMAND__';

// Encode the parser script as UTF-16LE base64 so we can pass it via PowerShell's -EncodedCommand flag;
// this avoids brittle quoting/escaping when spawning PowerShell and ensures the script is received byte-for-byte.
const POWERSHELL_PARSER_SCRIPT = Buffer.from(
  `
$ErrorActionPreference = 'Stop'
$commandText = $env:${POWERSHELL_COMMAND_ENV}
if ([string]::IsNullOrEmpty($commandText)) {
  Write-Output '{"success":false}'
  exit 0
}
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($commandText, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
  Write-Output '{"success":false}'
  exit 0
}
$commandAsts = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true)
$commandObjects = @()
$hasRedirection = $false
foreach ($commandAst in $commandAsts) {
  if ($commandAst.Redirections.Count -gt 0) {
    $hasRedirection = $true
  }
  $name = $commandAst.GetCommandName()
  if ([string]::IsNullOrWhiteSpace($name)) {
    continue
  }
  $args = @()
  if ($commandAst.CommandElements.Count -gt 1) {
    for ($i = 1; $i -lt $commandAst.CommandElements.Count; $i++) {
      $args += $commandAst.CommandElements[$i].Extent.Text.Trim()
    }
  }
  $commandObjects += [PSCustomObject]@{
    name = $name
    text = $commandAst.Extent.Text.Trim()
    args = $args
  }
}
[PSCustomObject]@{
  success = $true
  commands = $commandObjects
  hasRedirection = $hasRedirection
} | ConvertTo-Json -Compress
`,
  'utf16le',
).toString('base64');

export const REDIRECTION_NAMES = new Set([
  'redirection (<)',
  'redirection (>)',
  'heredoc (<<)',
  'herestring (<<<)',
  'command substitution',
  'backtick substitution',
  'process substitution',
  'subshell',
]);

function normalizeCommandName(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1);
    }
  }
  return raw.trim();
}

/**
 * Normalizes a command name for sandbox policy lookups.
 * Converts to lowercase and removes the .exe extension for cross-platform consistency.
 *
 * @param commandName - The command name to normalize.
 * @returns The normalized command name.
 */
export function normalizeCommand(commandName: string): string {
  // Split by both separators and get the last non-empty part
  const parts = commandName.split(/[\\/]/).filter(Boolean);
  const base = parts.length > 0 ? parts[parts.length - 1] : '';
  return base.toLowerCase().replace(/\.exe$/, '');
}

interface BashCollection {
  details: ParsedCommandDetail[];
  hasParseError: boolean;
  hasPromptCommandTransform: boolean;
  hasRedirection: boolean;
}

type ParsedBashScript = ReturnType<typeof parseBash>;

function collectScript(
  script: ParsedBashScript | undefined,
  source: string,
  result: BashCollection,
): void {
  if (!script) return;
  if (script.errors?.length) result.hasParseError = true;
  for (const statement of script.commands) {
    collectBashNode(statement, source, result);
  }
}

function collectSubstitution(
  name: string,
  text: string,
  script: ParsedBashScript | undefined,
  startIndex: number,
  source: string,
  result: BashCollection,
): void {
  result.details.push({ name, text, startIndex });
  collectScript(script, source, result);
}

function collectArithmeticExpression(
  expression: ArithmeticExpression | undefined,
  source: string,
  result: BashCollection,
): void {
  if (!expression) return;
  switch (expression.type) {
    case 'ArithmeticBinary':
      collectArithmeticExpression(expression.left, source, result);
      collectArithmeticExpression(expression.right, source, result);
      return;
    case 'ArithmeticUnary':
      collectArithmeticExpression(expression.operand, source, result);
      return;
    case 'ArithmeticTernary':
      collectArithmeticExpression(expression.test, source, result);
      collectArithmeticExpression(expression.consequent, source, result);
      collectArithmeticExpression(expression.alternate, source, result);
      return;
    case 'ArithmeticGroup':
      collectArithmeticExpression(expression.expression, source, result);
      return;
    case 'ArithmeticCommandExpansion':
      collectSubstitution(
        expression.text.startsWith('`')
          ? 'backtick substitution'
          : 'command substitution',
        expression.text,
        expression.script,
        expression.pos,
        source,
        result,
      );
      return;
    case 'ArithmeticWord':
    default:
      return;
  }
}

function collectWordPart(
  part: WordPart,
  word: Word,
  source: string,
  result: BashCollection,
): void {
  switch (part.type) {
    case 'CommandExpansion': {
      const startIndex = part.script
        ? part.script.pos - (part.text.startsWith('`') ? 1 : 2)
        : word.pos;
      collectSubstitution(
        part.text.startsWith('`')
          ? 'backtick substitution'
          : 'command substitution',
        part.text,
        part.script,
        startIndex,
        source,
        result,
      );
      return;
    }
    case 'ProcessSubstitution':
      collectSubstitution(
        'process substitution',
        part.text,
        part.script,
        part.script ? part.script.pos - 2 : word.pos,
        source,
        result,
      );
      return;
    case 'ArithmeticExpansion':
      collectArithmeticExpression(part.expression, source, result);
      return;
    case 'ParameterExpansion': {
      const operand = part.operand;
      if (
        part.operator === '@' &&
        operand !== undefined &&
        (operand.value === 'P' || operand.value === 'p')
      ) {
        result.hasPromptCommandTransform = true;
      }
      collectWord(operand, source, result);
      collectWord(part.slice?.offset, source, result);
      collectWord(part.slice?.length, source, result);
      collectWord(part.replace?.pattern, source, result);
      collectWord(part.replace?.replacement, source, result);
      return;
    }
    case 'DoubleQuoted':
    case 'LocaleString':
      for (const child of part.parts) {
        collectWordPart(child, word, source, result);
      }
      return;
    case 'Literal':
    case 'SingleQuoted':
    case 'AnsiCQuoted':
    case 'SimpleExpansion':
    case 'ExtendedGlob':
    case 'BraceExpansion':
    default:
      return;
  }
}

function collectWord(
  word: Word | undefined,
  source: string,
  result: BashCollection,
): void {
  if (!word) return;
  for (const part of word.parts ?? []) {
    collectWordPart(part, word, source, result);
  }
}

function collectTestExpression(
  expression: TestExpression,
  source: string,
  result: BashCollection,
): void {
  switch (expression.type) {
    case 'TestUnary':
      collectWord(expression.operand, source, result);
      return;
    case 'TestBinary':
      collectWord(expression.left, source, result);
      collectWord(expression.right, source, result);
      return;
    case 'TestLogical':
      collectTestExpression(expression.left, source, result);
      collectTestExpression(expression.right, source, result);
      return;
    case 'TestNot':
      collectTestExpression(expression.operand, source, result);
      return;
    case 'TestGroup':
      collectTestExpression(expression.expression, source, result);
      return;
    default:
      return;
  }
}

function redirectName(redirect: Redirect): string {
  if (redirect.operator === '<<' || redirect.operator === '<<-') {
    return 'heredoc (<<)';
  }
  if (redirect.operator === '<<<') return 'herestring (<<<)';
  return redirect.operator.includes('<')
    ? 'redirection (<)'
    : 'redirection (>)';
}

function collectRedirect(
  redirect: Redirect,
  source: string,
  result: BashCollection,
): void {
  result.hasRedirection = true;
  result.details.push({
    name: redirectName(redirect),
    text: source.slice(redirect.pos, redirect.end).trim(),
    startIndex: redirect.pos,
  });
  collectWord(redirect.target, source, result);
  collectWord(redirect.body, source, result);
}

function commandText(command: BashCommand, source: string): string {
  const redirects = command.redirects
    .filter((redirect) => redirect.operator !== '<<<')
    .sort((a, b) => a.pos - b.pos);
  if (redirects.length === 0) {
    return source.slice(command.pos, command.end).trim();
  }

  let text = '';
  let pos = command.pos;
  for (const redirect of redirects) {
    text += source.slice(pos, redirect.pos);
    pos = redirect.end;
  }
  return (text + source.slice(pos, command.end)).trim();
}

function collectCommand(
  command: BashCommand,
  source: string,
  result: BashCollection,
): void {
  if (command.name) {
    const detail: ParsedCommandDetail = {
      name: normalizeCommandName(command.name.text),
      text: commandText(command, source),
      startIndex: command.pos,
    };
    if (command.suffix.length > 0) {
      detail.args = command.suffix.map((word) => word.text);
    }
    result.details.push(detail);
  }

  collectWord(command.name, source, result);
  for (const prefix of command.prefix) {
    collectWord(prefix.value, source, result);
    for (const word of prefix.array ?? []) collectWord(word, source, result);
  }
  for (const word of command.suffix) collectWord(word, source, result);
  for (const redirect of command.redirects) {
    collectRedirect(redirect, source, result);
  }
}

function collectBashNode(
  node: BashNode | undefined,
  source: string,
  result: BashCollection,
): void {
  if (!node) return;
  switch (node.type) {
    case 'Command':
      collectCommand(node, source, result);
      return;
    case 'Statement':
      collectBashNode(node.command, source, result);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, result);
      }
      return;
    case 'Pipeline':
    case 'AndOr':
    case 'CompoundList':
      for (const child of node.commands) {
        collectBashNode(child, source, result);
      }
      return;
    case 'If':
      collectBashNode(node.clause, source, result);
      collectBashNode(node.then, source, result);
      collectBashNode(node.else, source, result);
      return;
    case 'For':
    case 'Select':
      for (const word of node.wordlist) collectWord(word, source, result);
      collectBashNode(node.body, source, result);
      return;
    case 'ArithmeticFor':
      collectArithmeticExpression(node.initialize, source, result);
      collectArithmeticExpression(node.test, source, result);
      collectArithmeticExpression(node.update, source, result);
      collectBashNode(node.body, source, result);
      return;
    case 'While':
      collectBashNode(node.clause, source, result);
      collectBashNode(node.body, source, result);
      return;
    case 'Function':
      collectBashNode(node.body, source, result);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, result);
      }
      return;
    case 'Subshell':
      result.details.push({
        name: 'subshell',
        text: source.slice(node.pos, node.end).trim(),
        startIndex: node.pos,
      });
      collectBashNode(node.body, source, result);
      return;
    case 'BraceGroup':
      collectBashNode(node.body, source, result);
      return;
    case 'Case':
      collectWord(node.word, source, result);
      for (const item of node.items) {
        for (const word of item.pattern) collectWord(word, source, result);
        collectBashNode(item.body, source, result);
      }
      return;
    case 'Coproc':
      collectBashNode(node.body, source, result);
      for (const redirect of node.redirects) {
        collectRedirect(redirect, source, result);
      }
      return;
    case 'TestCommand':
      collectTestExpression(node.expression, source, result);
      return;
    case 'ArithmeticCommand':
      collectArithmeticExpression(node.expression, source, result);
      return;
    default:
      return;
  }
}

export function parseBashCommandDetails(
  command: string,
): CommandParseResult | null {
  let script: ReturnType<typeof parseBash>;
  try {
    script = parseBash(command);
  } catch (error) {
    debugLogger.debug('Failed to parse Bash command:', error);
    return null;
  }

  const result: BashCollection = {
    details: [],
    hasParseError: false,
    hasPromptCommandTransform: false,
    hasRedirection: false,
  };
  collectScript(script, command, result);

  const hasError =
    result.hasParseError ||
    result.details.length === 0 ||
    result.hasPromptCommandTransform;

  return {
    details: result.details.sort((a, b) => a.startIndex - b.startIndex),
    hasError,
    hasRedirection: result.hasRedirection,
  };
}

function parsePowerShellCommandDetails(
  command: string,
  executable: string,
): CommandParseResult | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return {
      details: [],
      hasError: true,
    };
  }

  try {
    const result = spawnSync(
      executable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        POWERSHELL_PARSER_SCRIPT,
      ],
      {
        env: {
          ...process.env,
          [POWERSHELL_COMMAND_ENV]: command,
        },
        encoding: 'utf-8',
      },
    );

    if (result.error || result.status !== 0) {
      return null;
    }

    const output = (result.stdout ?? '').toString().trim();
    if (!output) {
      return { details: [], hasError: true };
    }

    let parsed: {
      success?: boolean;
      commands?: Array<{ name?: string; text?: string; args?: string[] }>;
      hasRedirection?: boolean;
    } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      parsed = JSON.parse(output);
    } catch {
      return { details: [], hasError: true };
    }

    if (!parsed?.success) {
      return { details: [], hasError: true };
    }

    const details = (parsed.commands ?? [])
      .map((commandDetail): ParsedCommandDetail | null => {
        if (!commandDetail || typeof commandDetail.name !== 'string') {
          return null;
        }

        const name = normalizeCommandName(commandDetail.name);
        const text =
          typeof commandDetail.text === 'string'
            ? commandDetail.text.trim()
            : command;

        return {
          name,
          text,
          startIndex: 0,
          args: Array.isArray(commandDetail.args)
            ? commandDetail.args
            : undefined,
        };
      })
      .filter((detail): detail is ParsedCommandDetail => detail !== null);

    return {
      details,
      hasError: details.length === 0,
      hasRedirection: parsed.hasRedirection,
    };
  } catch {
    return null;
  }
}

export function parseCommandDetails(
  command: string,
): CommandParseResult | null {
  const configuration = getShellConfiguration();

  if (configuration.shell === 'powershell') {
    const result = parsePowerShellCommandDetails(
      command,
      configuration.executable,
    );
    if (!result || result.hasError) {
      // Fallback to bash parser which is usually good enough for simple commands
      // and doesn't rely on the host PowerShell environment restrictions (e.g., ConstrainedLanguage)
      const bashResult = parseBashCommandDetails(command);
      if (bashResult && !bashResult.hasError) {
        return bashResult;
      }
    }
    return result;
  }

  if (configuration.shell === 'bash') {
    return parseBashCommandDetails(command);
  }

  return null;
}

/**
 * Determines the appropriate shell configuration for the current platform.
 *
 * This ensures we can execute command strings predictably and securely across platforms
 * using the `spawn(executable, [...argsPrefix, commandString], { shell: false })` pattern.
 *
 * On Windows, PowerShell 7 (pwsh.exe) is preferred over Windows PowerShell 5.1
 * (powershell.exe) when available on PATH. Windows PowerShell 5.1 silently
 * strips embedded double quotes from arguments to native executables — see
 * issue #25859. PowerShell 7 uses standards-compliant argument passing and
 * does not exhibit this regression. When pwsh.exe is not installed, we fall
 * back to powershell.exe to preserve the existing behavior and the full
 * cmdlet surface users depend on.
 *
 * @returns The ShellConfiguration for the current environment.
 */
export function getShellConfiguration(): ShellConfiguration {
  if (isWindows()) {
    // -NonInteractive prevents PSReadLine from intercepting console input
    // events inside the ConPTY session, which otherwise causes interactive
    // TUI tools (e.g. pnpm create vite, vim) to receive malformed key events
    // and exit when arrow keys are pressed.
    const powershellArgsPrefix = ['-NoProfile', '-NonInteractive', '-Command'];
    const comSpec = process.env['ComSpec'];
    if (comSpec) {
      const executable = comSpec.toLowerCase();
      if (
        executable.endsWith('powershell.exe') ||
        executable.endsWith('pwsh.exe')
      ) {
        return {
          executable: comSpec,
          argsPrefix: powershellArgsPrefix,
          shell: 'powershell',
        };
      }
    }

    const pwshPath = resolveExecutable('pwsh.exe');
    if (pwshPath) {
      return {
        executable: pwshPath,
        argsPrefix: ['-NoProfile', '-Command'],
        shell: 'powershell',
      };
    }

    // Fall back to Windows PowerShell 5.1 when pwsh.exe is not installed.
    return {
      executable: 'powershell.exe',
      argsPrefix: powershellArgsPrefix,
      shell: 'powershell',
    };
  }

  // Unix-like systems (Linux, macOS)
  return { executable: 'bash', argsPrefix: ['-c'], shell: 'bash' };
}

/**
 * Export the platform detection constant for use in process management (e.g., killing processes).
 */
export const isWindows = () => os.platform() === 'win32';

/**
 * Escapes a string so that it can be safely used as a single argument
 * in a shell command, preventing command injection.
 *
 * @param arg The argument string to escape.
 * @param shell The type of shell the argument is for.
 * @returns The shell-escaped string.
 */
export function escapeShellArg(arg: string, shell: ShellType): string {
  if (!arg) {
    return '';
  }

  switch (shell) {
    case 'powershell':
      // For PowerShell, avoid quoting simple alphanumeric strings (like UUIDs).
      if (/^[a-zA-Z0-9\-_.]+$/.test(arg)) {
        return arg;
      }
      // Otherwise, wrap in single quotes and escape internal single quotes by doubling them.
      return `'${arg.replace(/'/g, "''")}'`;
    case 'cmd':
      // Avoid quoting simple strings for cmd.exe as well.
      if (/^[a-zA-Z0-9\-_.]+$/.test(arg)) {
        return arg;
      }
      // Simple Windows escaping for cmd.exe: wrap in double quotes and escape inner double quotes.
      return `"${arg.replace(/"/g, '""')}"`;
    case 'bash':
    default:
      // POSIX shell escaping using shell-quote.
      return quote([arg]);
  }
}

/**
 * Splits a shell command into a list of individual commands, respecting quotes.
 * This is used to separate chained commands (e.g., using &&, ||, ;).
 * @param command The shell command string to parse
 * @returns An array of individual command strings
 */
/**
 * Checks if a command contains redirection operators.
 * Uses shell-specific parsers where possible, falling back to a broad regex check.
 */
export function hasRedirection(command: string): boolean {
  const fallbackCheck = () => /[><]/.test(command);

  // If there are no redirection characters at all, we can skip parsing.
  if (!fallbackCheck()) {
    return false;
  }

  const configuration = getShellConfiguration();

  if (configuration.shell === 'powershell') {
    const parsed = parsePowerShellCommandDetails(
      command,
      configuration.executable,
    );
    return parsed && !parsed.hasError
      ? !!parsed.hasRedirection
      : fallbackCheck();
  }

  if (configuration.shell === 'bash') {
    const parsed = parseBashCommandDetails(command);
    return parsed && !parsed.hasError
      ? !!parsed.hasRedirection
      : fallbackCheck();
  }

  return fallbackCheck();
}

export function splitCommands(command: string): string[] {
  const parsed = parseCommandDetails(command);
  if (!parsed || parsed.hasError) {
    return [];
  }

  return parsed.details
    .filter((detail) => !REDIRECTION_NAMES.has(detail.name))
    .map((detail) => detail.text)
    .filter(Boolean);
}

/**
 * Extracts the root command from a given shell command string.
 * This is used to identify the base command for permission checks.
 * @param command The shell command string to parse
 * @returns The root command name, or undefined if it cannot be determined
 * @example getCommandRoot("ls -la /tmp") returns "ls"
 * @example getCommandRoot("git status && npm test") returns "git"
 */
export function getCommandRoot(command: string): string | undefined {
  const parsed = parseCommandDetails(command);
  if (!parsed || parsed.hasError || parsed.details.length === 0) {
    return undefined;
  }

  return parsed.details[0]?.name;
}

export function getCommandRoots(command: string): string[] {
  if (!command) {
    return [];
  }

  const parsed = parseCommandDetails(command);
  if (!parsed || parsed.hasError) {
    return [];
  }

  return parsed.details
    .map((detail) => detail.name)
    .filter((name) => !REDIRECTION_NAMES.has(name))
    .filter(Boolean);
}

export function stripShellWrapper(command: string): string {
  const pattern =
    /^\s*(?:(?:(?:\S+\/)?(?:sh|bash|zsh))\s+-c|cmd\.exe\s+\/c|powershell(?:\.exe)?\s+(?:-NoProfile\s+)?-Command|pwsh(?:\.exe)?\s+(?:-NoProfile\s+)?-Command)\s+/i;
  const match = command.match(pattern);
  if (match) {
    let newCommand = command.substring(match[0].length).trim();
    if (
      newCommand.length >= 2 &&
      ((newCommand.startsWith('"') && newCommand.endsWith('"')) ||
        (newCommand.startsWith("'") && newCommand.endsWith("'")))
    ) {
      const isPosixShell = match[0].trim().endsWith('-c');
      if (isPosixShell && newCommand.startsWith('"')) {
        try {
          const parsed = parse(newCommand, (key) => '$' + key);
          const firstEntry = parsed[0];
          if (parsed.length === 1 && typeof firstEntry === 'string') {
            newCommand = firstEntry;
          } else {
            newCommand = newCommand.substring(1, newCommand.length - 1);
          }
        } catch {
          newCommand = newCommand.substring(1, newCommand.length - 1);
        }
      } else {
        newCommand = newCommand.substring(1, newCommand.length - 1);
      }
    }
    return newCommand;
  }
  return command.trim();
}

/**
 * Detects command substitution patterns in a shell command, following bash quoting rules:
 * - Single quotes ('): Everything literal, no substitution possible
 * - Double quotes ("): Command substitution with $() and backticks unless escaped with \
 * - No quotes: Command substitution with $(), <(), and backticks
 * @param command The shell command string to check
 * @returns true if command substitution would be executed by bash
 */
/**
 * Determines whether a given shell command is allowed to execute based on
 * the tool's configuration including allowlists and blocklists.
 *
 * This function operates in "default allow" mode. It is a wrapper around
 * `checkCommandPermissions`.
 *
 * @param command The shell command string to validate.
 * @param config The application configuration.
 * @returns An object with 'allowed' boolean and optional 'reason' string if not allowed.
 */
export const spawnAsync = async (
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio & { sandboxManager?: SandboxManager },
): Promise<{ stdout: string; stderr: string }> => {
  const sandboxManager = options?.sandboxManager ?? new NoopSandboxManager();
  const prepared = await sandboxManager.prepareCommand({
    command,
    args,
    cwd: options?.cwd?.toString() ?? process.cwd(),
    env: options?.env ?? process.env,
  });

  const { program: finalCommand, args: finalArgs, env: finalEnv } = prepared;

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(finalCommand, finalArgs, {
        ...options,
        env: finalEnv,
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new Error(`Command failed with exit code ${code}:\n${stderr}`),
          );
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  } finally {
    prepared.cleanup?.();
  }
};

/**
 * Executes a command and yields lines of output as they appear.
 * Use for large outputs where buffering is not feasible.
 *
 * @param command The executable to run
 * @param args Arguments for the executable
 * @param options Spawn options (cwd, env, etc.)
 */
export async function* execStreaming(
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio & {
    signal?: AbortSignal;
    allowedExitCodes?: number[];
    sandboxManager?: SandboxManager;
  },
): AsyncGenerator<string, void, void> {
  const sandboxManager = options?.sandboxManager ?? new NoopSandboxManager();
  const prepared = await sandboxManager.prepareCommand({
    command,
    args,
    cwd: options?.cwd?.toString() ?? process.cwd(),
    env: options?.env ?? process.env,
  });

  try {
    const { program: finalCommand, args: finalArgs, env: finalEnv } = prepared;

    const child = spawn(finalCommand, finalArgs, {
      ...options,
      env: finalEnv,
      // ensure we don't open a window on windows if possible/relevant
      windowsHide: true,
    });

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    const errorChunks: Buffer[] = [];
    let stderrTotalBytes = 0;
    const MAX_STDERR_BYTES = 20 * 1024; // 20KB limit

    child.stderr.on('data', (chunk) => {
      if (stderrTotalBytes < MAX_STDERR_BYTES) {
        errorChunks.push(chunk);
        stderrTotalBytes += chunk.length;
      }
    });

    let error: Error | null = null;
    child.on('error', (err) => {
      error = err;
    });

    const onAbort = () => {
      // If manually aborted by signal, we kill immediately.
      if (!child.killed) child.kill();
    };

    if (options?.signal?.aborted) {
      onAbort();
    } else {
      options?.signal?.addEventListener('abort', onAbort);
    }

    let finished = false;
    try {
      for await (const line of rl) {
        if (options?.signal?.aborted) break;
        yield line;
      }
      finished = true;
    } finally {
      rl.close();
      options?.signal?.removeEventListener('abort', onAbort);

      // Ensure process is killed when the generator is closed (consumer breaks loop)
      let killedByGenerator = false;
      if (!finished && child.exitCode === null && !child.killed) {
        try {
          child.kill();
        } catch {
          // ignore error if process is already dead
        }
        killedByGenerator = true;
      }

      // Ensure we wait for the process to exit to check codes
      await new Promise<void>((resolve, reject) => {
        // If an error occurred before we got here (e.g. spawn failure), reject immediately.
        if (error) {
          reject(error);
          return;
        }

        function checkExit(code: number | null) {
          // If we aborted or killed it manually, we treat it as success (stop waiting)
          if (options?.signal?.aborted || killedByGenerator) {
            resolve();
            return;
          }

          const allowed = options?.allowedExitCodes ?? [0];
          if (code !== null && allowed.includes(code)) {
            resolve();
          } else {
            // If we have an accumulated error or explicit error event
            if (error) reject(error);
            else {
              const stderr = Buffer.concat(errorChunks).toString('utf8');
              const truncatedMsg =
                stderrTotalBytes >= MAX_STDERR_BYTES ? '...[truncated]' : '';
              reject(
                new Error(
                  `Process exited with code ${code}: ${stderr}${truncatedMsg}`,
                ),
              );
            }
          }
        }

        if (child.exitCode !== null) {
          checkExit(child.exitCode);
        } else {
          child.on('close', (code) => checkExit(code));
          child.on('error', (err) => {
            reject(err);
          });
        }
      });
    }
  } finally {
    prepared.cleanup?.();
  }
}

export function detectCommandSubstitution(command: string): boolean {
  const shell = getShellConfiguration().shell;
  const isPowerShell =
    typeof shell === 'string' &&
    (shell.toLowerCase().includes('powershell') ||
      shell.toLowerCase().includes('pwsh'));
  if (isPowerShell) {
    return detectPowerShellSubstitution(command);
  }
  return detectBashSubstitution(command);
}

function detectBashSubstitution(command: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;
  while (i < command.length) {
    const char = command[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }
    if (inSingleQuote) {
      i++;
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      if (inDoubleQuote) {
        const next = command[i + 1];
        if (['$', '`', '"', '\\', '\n'].includes(next)) {
          i += 2;
          continue;
        }
      } else {
        i += 2;
        continue;
      }
    }
    if (char === '$' && command[i + 1] === '(') {
      return true;
    }
    if (
      !inDoubleQuote &&
      (char === '<' || char === '>') &&
      command[i + 1] === '('
    ) {
      return true;
    }
    if (char === '`') {
      return true;
    }
    i++;
  }
  return false;
}

const POWERSHELL_KEYWORD_RE =
  /\b(if|elseif|else|foreach|for|while|do|switch|try|catch|finally|until|trap|function|filter)(\s+[-\w]+)*\s*$/i;

function detectPowerShellSubstitution(command: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;
  while (i < command.length) {
    const char = command[i];

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }

    if (inSingleQuote) {
      i++;
      continue;
    }
    if (char === '`' && i + 1 < command.length) {
      i += 2;
      continue;
    }
    if (char === '$' && command[i + 1] === '(') {
      return true;
    }
    if (!inDoubleQuote && char === '@' && command[i + 1] === '(') {
      return true;
    }
    if (!inDoubleQuote && char === '(') {
      const before = command.slice(0, i).trimEnd();
      const prevChar = before[before.length - 1];
      if (prevChar === '(') {
        i++;
        continue;
      }
      if (POWERSHELL_KEYWORD_RE.test(before)) {
        i++;
        continue;
      }
      return true;
    }

    i++;
  }
  return false;
}
