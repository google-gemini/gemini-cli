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
  await initializeShellParsers();
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
import { Language, Parser, Query, type Node, type Tree } from 'web-tree-sitter';
import { loadWasmBinary } from './fileUtils.js';
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

let bashLanguage: Language | null = null;
let treeSitterInitialization: Promise<void> | null = null;
let treeSitterInitializationError: Error | null = null;

class ShellParserInitializationError extends Error {
  constructor(cause: Error) {
    super(`Failed to initialize bash parser: ${cause.message}`, { cause });
    this.name = 'ShellParserInitializationError';
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  return new Error('Unknown tree-sitter initialization error', {
    cause: value,
  });
}

async function loadBashLanguage(): Promise<void> {
  try {
    treeSitterInitializationError = null;
    const [treeSitterBinary, bashBinary] = await Promise.all([
      loadWasmBinary(
        () =>
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore resolved by esbuild-plugin-wasm during bundling
          import('web-tree-sitter/tree-sitter.wasm?binary'),
        'web-tree-sitter/tree-sitter.wasm',
      ),
      loadWasmBinary(
        () =>
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore resolved by esbuild-plugin-wasm during bundling
          import('tree-sitter-bash/tree-sitter-bash.wasm?binary'),
        'tree-sitter-bash/tree-sitter-bash.wasm',
      ),
    ]);

    await Parser.init({ wasmBinary: treeSitterBinary });
    bashLanguage = await Language.load(bashBinary);
  } catch (error) {
    bashLanguage = null;
    const normalized = toError(error);
    const initializationError =
      normalized instanceof ShellParserInitializationError
        ? normalized
        : new ShellParserInitializationError(normalized);
    treeSitterInitializationError = initializationError;
    throw initializationError;
  }
}

export async function initializeShellParsers(): Promise<void> {
  if (!treeSitterInitialization) {
    treeSitterInitialization = loadBashLanguage().catch((error) => {
      treeSitterInitialization = null;
      // Log the error but don't throw, allowing the application to fall back to safe defaults (ASK_USER)
      // or regex checks where appropriate.
      debugLogger.debug('Failed to initialize shell parsers:', error);
    });
  }

  await treeSitterInitialization;
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
const PARSE_TIMEOUT_MICROS = 1000 * 1000; // 1 second

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

function createParser(): Parser | null {
  if (!bashLanguage) {
    if (treeSitterInitializationError) {
      throw treeSitterInitializationError;
    }
    return null;
  }

  try {
    const parser = new Parser();
    parser.setLanguage(bashLanguage);
    return parser;
  } catch {
    return null;
  }
}

function parseCommandTree(
  command: string,
  timeoutMicros: number = PARSE_TIMEOUT_MICROS,
): Tree | null {
  const parser = createParser();
  if (!parser || !command.trim()) {
    return null;
  }

  const deadline = performance.now() + timeoutMicros / 1000;
  let timedOut = false;

  try {
    const tree = parser.parse(command, null, {
      progressCallback: () => {
        if (performance.now() > deadline) {
          timedOut = true;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return true as unknown as void; // Returning true cancels parsing, but type says void
        }
      },
    });

    if (timedOut) {
      debugLogger.error('Bash command parsing timed out for command:', command);
      // Returning a partial tree could be risky so we return null to be safe.
      return null;
    }

    return tree;
  } catch {
    return null;
  }
}

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

function extractNameFromNode(node: Node): string | null {
  switch (node.type) {
    case 'command': {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) {
        return null;
      }
      return normalizeCommandName(nameNode.text);
    }
    case 'declaration_command':
    case 'unset_command':
    case 'test_command': {
      const firstChild = node.child(0);
      if (!firstChild) {
        return null;
      }
      return normalizeCommandName(firstChild.text);
    }
    case 'file_redirect': {
      // The first child might be a file descriptor (e.g., '2>').
      // We iterate to find the actual operator token.
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.text.includes('<')) {
          return 'redirection (<)';
        }
        if (child && child.text.includes('>')) {
          return 'redirection (>)';
        }
      }
      return 'redirection (>)';
    }
    case 'heredoc_redirect':
      return 'heredoc (<<)';
    case 'herestring_redirect':
      return 'herestring (<<<)';
    case 'command_substitution':
      return 'command substitution';
    case 'backtick_substitution':
      return 'backtick substitution';
    case 'process_substitution':
      return 'process substitution';
    case 'subshell':
      return 'subshell';
    default:
      return null;
  }
}

function collectCommandDetails(
  root: Node,
  source: string,
): ParsedCommandDetail[] {
  const stack: Node[] = [root];
  const details: ParsedCommandDetail[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;

    const name = extractNameFromNode(current);
    if (name) {
      const detail: ParsedCommandDetail = {
        name,
        text: source.slice(current.startIndex, current.endIndex).trim(),
        startIndex: current.startIndex,
      };

      if (current.type === 'command') {
        const args: string[] = [];
        const nameNode = current.childForFieldName('name');
        for (let i = 0; i < current.childCount; i += 1) {
          const child = current.child(i);
          if (
            child &&
            child.type === 'word' &&
            child.startIndex !== nameNode?.startIndex
          ) {
            args.push(child.text);
          }
        }
        if (args.length > 0) {
          detail.args = args;
        }
      }

      details.push(detail);
    }

    // Traverse all children to find all sub-components (commands, redirections, etc.)
    for (let i = current.childCount - 1; i >= 0; i -= 1) {
      const child = current.child(i);
      if (child) {
        stack.push(child);
      }
    }
  }

  return details;
}

function hasPromptCommandTransform(root: Node): boolean {
  const stack: Node[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.type === 'expansion') {
      for (let i = 0; i < current.childCount - 1; i += 1) {
        const operatorNode = current.child(i);
        const transformNode = current.child(i + 1);

        if (
          operatorNode?.text === '@' &&
          transformNode?.text?.toLowerCase() === 'p'
        ) {
          return true;
        }
      }
    }

    for (let i = current.namedChildCount - 1; i >= 0; i -= 1) {
      const child = current.namedChild(i);
      if (child) {
        stack.push(child);
      }
    }
  }

  return false;
}

export function parseBashCommandDetails(
  command: string,
): CommandParseResult | null {
  if (treeSitterInitializationError) {
    debugLogger.debug(
      'Bash parser not initialized:',
      treeSitterInitializationError,
    );
    return null;
  }

  if (!bashLanguage) {
    initializeShellParsers().catch(() => {
      // The failure path is surfaced via treeSitterInitializationError.
    });
    return null;
  }

  const tree = parseCommandTree(command);
  if (!tree) {
    return null;
  }

  const details = collectCommandDetails(tree.rootNode, command);

  const hasError =
    tree.rootNode.hasError ||
    details.length === 0 ||
    hasPromptCommandTransform(tree.rootNode);

  if (hasError) {
    let query = null;
    try {
      query = new Query(bashLanguage, '(ERROR) @error (MISSING) @missing');
      const captures = query.captures(tree.rootNode);
      const syntaxErrors = captures.map((capture) => {
        const { node, name } = capture;
        const type = name === 'missing' ? 'Missing' : 'Error';
        return `${type} node: "${node.text}" at ${node.startPosition.row}:${node.startPosition.column}`;
      });

      debugLogger.log(
        'Bash command parsing error detected for command:',
        command,
        'Syntax Errors:',
        syntaxErrors,
      );
    } catch {
      // Ignore query errors
    } finally {
      query?.delete();
    }
  }
  return {
    details: details.sort((a, b) => a.startIndex - b.startIndex),
    hasError,
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

  if (configuration.shell === 'bash' && bashLanguage) {
    const tree = parseCommandTree(command);
    if (!tree) return fallbackCheck();

    const stack: Node[] = [tree.rootNode];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (
        current.type === 'redirected_statement' ||
        current.type === 'file_redirect' ||
        current.type === 'heredoc_redirect' ||
        current.type === 'herestring_redirect'
      ) {
        return true;
      }
      for (let i = current.childCount - 1; i >= 0; i -= 1) {
        const child = current.child(i);
        if (child) stack.push(child);
      }
    }
    return false;
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

/**
 * Checks whether a POSIX shell CLI token represents the command execution termination flag.
 * Supports standalone -c or +c, as well as valid short-flag chains where the final flag is 'c'
 * (e.g. -xc, -ec, -exic, -lc, +xc).
 * Ensures intermediate flags are valid POSIX single-character option letters that do not take arguments
 * (specifically excluding 'o' and 'O', which require an option argument in POSIX shells).
 */
function isPosixTerminationFlag(token: string): boolean {
  if (token.length < 2) {
    return false;
  }
  const first = token[0];
  if (first !== '-' && first !== '+') {
    return false;
  }
  // Reject long options like --exec or --rc
  if (token[1] === '-') {
    return false;
  }
  // Must end with 'c'
  if (token[token.length - 1] !== 'c') {
    return false;
  }
  // Standalone -c or +c
  if (token.length === 2) {
    return true;
  }
  // For chained flags (e.g. -xc, -exic, -lc), verify all intermediate characters
  // are valid short-flag letters that do not take arguments (excluding 'o' and 'O').
  for (let i = 1; i < token.length - 1; i++) {
    const ch = token[i];
    const isLetter = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    if (!isLetter || ch === 'o' || ch === 'O') {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether a PowerShell CLI token represents the command execution termination flag (-Command, -c, or -CommandWithArgs).
 * Matches valid PowerShell abbreviations starting with 'c' or 'co' for -Command, or -cwa / -commandwithargs.
 */
function isPowerShellTerminationFlag(token: string): boolean {
  if (!token.startsWith('-') && !token.startsWith('/')) {
    return false;
  }
  const name = token.replace(/^[-/]+/, '').toLowerCase();
  return (
    name === 'c' ||
    (name.startsWith('co') && 'command'.startsWith(name)) ||
    name === 'cwa' ||
    (name.startsWith('commandwithargs') && 'commandwithargs'.startsWith(name))
  );
}

/**
 * Checks whether a PowerShell CLI parameter expects an argument (e.g. -ExecutionPolicy Bypass, -WindowStyle Hidden).
 * Correctly accounts for valid PowerShell abbreviations and / prefixes.
 */
function isPowerShellArgTakingFlag(token: string): boolean {
  if (!token.startsWith('-') && !token.startsWith('/')) {
    return false;
  }
  const name = token.replace(/^[-/]+/, '').toLowerCase();

  // ExecutionPolicy: -ep, -ex, -exec, ..., -executionpolicy
  if (
    name === 'ep' ||
    (name.startsWith('ex') && 'executionpolicy'.startsWith(name))
  ) {
    return true;
  }

  // WindowStyle (-w, -wi, -win, ...) and WorkingDirectory (-wd, -wo, -work, ...)
  // Note: All PowerShell parameters starting with 'w' take an argument.
  if (
    name === 'w' ||
    name === 'wd' ||
    (name.startsWith('wi') && 'windowstyle'.startsWith(name)) ||
    (name.startsWith('wo') && 'workingdirectory'.startsWith(name))
  ) {
    return true;
  }

  // Version: -v, -ve, -ver, ..., -version (in powershell.exe takes version argument)
  if (name.length >= 1 && 'version'.startsWith(name)) {
    return true;
  }

  // ConfigurationName & ConfigurationFile: -config, -conf, ..., -configurationname, -configurationfile
  if (
    name === 'config' ||
    (name.startsWith('conf') &&
      ('configurationname'.startsWith(name) ||
        'configurationfile'.startsWith(name)))
  ) {
    return true;
  }

  // CustomPipeName: -cu, -cust, ..., -custompipename
  if (name.startsWith('cu') && 'custompipename'.startsWith(name)) {
    return true;
  }

  // OutputFormat: -o, -of, -out, ..., -outputformat
  if (
    name === 'o' ||
    name === 'of' ||
    (name.startsWith('out') && 'outputformat'.startsWith(name))
  ) {
    return true;
  }

  // InputFormat: -if, -inp, ..., -inputformat (Note: 1-char -i is -Interactive, a switch!)
  if (
    name === 'if' ||
    (name.startsWith('inp') && 'inputformat'.startsWith(name))
  ) {
    return true;
  }

  // EncodedCommand & EncodedArguments: -e, -ec, -enc, ..., -encodedcommand
  if (
    name === 'e' ||
    name === 'ec' ||
    (name.startsWith('enc') &&
      ('encodedcommand'.startsWith(name) ||
        'encodedarguments'.startsWith(name)))
  ) {
    return true;
  }

  // SettingsFile: -settings, -set, ..., -settingsfile (Note: 1-char -s is ambiguous with -Sta / -SSHServerMode)
  if (
    name === 'settings' ||
    (name.startsWith('set') && 'settingsfile'.startsWith(name))
  ) {
    return true;
  }

  // PSConsoleFile: -psc, -pscon, ..., -psconsolefile (in powershell.exe)
  if (
    name === 'psc' ||
    (name.startsWith('pscon') && 'psconsolefile'.startsWith(name))
  ) {
    return true;
  }

  // File: -f, -file (if encountered in shell wrapper)
  if (name === 'f' || name === 'file') {
    return true;
  }

  return false;
}

/**
 * Strips outer shell invocation wrappers (e.g., bash -c, sh -c, cmd.exe /c, powershell -Command),
 * including intermediate option flags (e.g., -e, -x, -o pipefail, -ExecutionPolicy Bypass).
 *
 * Uses an iterative token scanner rather than complex nested-quantifier regexes to eliminate
 * any risk of Regular Expression Denial of Service (ReDoS).
 */
export function stripShellWrapper(command: string): string {
  // 1. Identify the shell binary prefix safely with no nested quantifiers
  const prefixMatch = command.match(
    /^\s*(?:(?:\S+[/\\])?(sh|bash|zsh|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?))\b/i,
  );
  if (!prefixMatch) {
    return command.trim();
  }

  const rawBinary = prefixMatch[1].toLowerCase();
  const baseBinary = rawBinary.endsWith('.exe')
    ? rawBinary.slice(0, -4)
    : rawBinary;
  const isPosix =
    baseBinary === 'sh' || baseBinary === 'bash' || baseBinary === 'zsh';
  const isCmd = baseBinary === 'cmd';
  const isPowerShell = baseBinary === 'powershell' || baseBinary === 'pwsh';

  let pos = prefixMatch[0].length;
  const len = command.length;

  const skipWhitespace = () => {
    while (pos < len && /\s/.test(command[pos])) {
      pos++;
    }
  };

  skipWhitespace();
  if (pos >= len) {
    return command.trim();
  }

  // 2. Iteratively scan intermediate option flags until the termination flag (-c, /c, -Command)
  let foundTerminationFlag = false;
  let expectsFlagArg = false;

  while (pos < len) {
    skipWhitespace();
    if (pos >= len) break;

    // Check for termination flag at current position if not expecting an argument
    if (!expectsFlagArg) {
      if (isPosix) {
        let peekPos = pos;
        while (peekPos < len && !/\s/.test(command[peekPos])) {
          peekPos++;
        }
        let candidate = command.substring(pos, peekPos);
        if (
          candidate.length >= 2 &&
          ((candidate.startsWith('"') && candidate.endsWith('"')) ||
            (candidate.startsWith("'") && candidate.endsWith("'")))
        ) {
          candidate = candidate.slice(1, -1);
        }
        if (isPosixTerminationFlag(candidate)) {
          foundTerminationFlag = true;
          pos = peekPos;
          break;
        }
      } else if (isCmd) {
        if (
          command[pos] === '/' &&
          command[pos + 1]?.toLowerCase() === 'c' &&
          (pos + 2 === len || /\s/.test(command[pos + 2]))
        ) {
          foundTerminationFlag = true;
          pos += 2;
          break;
        }
      } else if (isPowerShell) {
        let peekPos = pos;
        while (peekPos < len && !/\s/.test(command[peekPos])) {
          peekPos++;
        }
        const candidate = command.substring(pos, peekPos);
        if (isPowerShellTerminationFlag(candidate)) {
          foundTerminationFlag = true;
          pos = peekPos;
          break;
        }
      }
    }

    // Read the next token (accounting for quotes and POSIX backslash escapes)
    const tokenStart = pos;
    while (pos < len) {
      if (isPosix && command[pos] === '\\') {
        if (pos + 1 < len) {
          pos += 2;
        } else {
          pos++;
        }
      } else if (command[pos] === '"' || command[pos] === "'") {
        const quoteChar = command[pos];
        pos++;
        while (pos < len && command[pos] !== quoteChar) {
          if (quoteChar === '"' && command[pos] === '\\' && pos + 1 < len) {
            pos += 2;
          } else {
            pos++;
          }
        }
        if (pos < len && command[pos] === quoteChar) {
          pos++;
        }
      } else if (/\s/.test(command[pos])) {
        break;
      } else {
        pos++;
      }
    }

    const token = command.substring(tokenStart, pos);
    if (!token) break;

    if (expectsFlagArg) {
      expectsFlagArg = false;
      continue;
    }

    const isFlag =
      (isPosix && (token.startsWith('-') || token.startsWith('+'))) ||
      (isCmd && token.startsWith('/')) ||
      (isPowerShell && (token.startsWith('-') || token.startsWith('/')));

    if (!isFlag) {
      return command.trim();
    }

    const lowerToken = token.toLowerCase();
    if (isPosix) {
      if (
        lowerToken === '-o' ||
        lowerToken === '+o' ||
        lowerToken === '-O' ||
        lowerToken.endsWith('o') ||
        lowerToken === '--rcfile' ||
        lowerToken === '--init-file'
      ) {
        expectsFlagArg = true;
      }
    } else if (isPowerShell) {
      if (isPowerShellArgTakingFlag(token)) {
        expectsFlagArg = true;
      }
    }
  }

  if (!foundTerminationFlag) {
    return command.trim();
  }

  // 3. Extract the inner command payload
  let newCommand = command.substring(pos).trim();

  // 4. Robust unquoting and POSIX safe-parsing
  if (
    newCommand.length >= 2 &&
    ((newCommand.startsWith('"') && newCommand.endsWith('"')) ||
      (newCommand.startsWith("'") && newCommand.endsWith("'")))
  ) {
    if (isPosix && newCommand.startsWith('"')) {
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
