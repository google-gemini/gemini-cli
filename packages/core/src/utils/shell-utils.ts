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
  hasCommandSubstitution?: boolean;
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
  $cmdArgs = @()
  if ($commandAst.CommandElements.Count -gt 1) {
    for ($i = 1; $i -lt $commandAst.CommandElements.Count; $i++) {
      $cmdArgs += $commandAst.CommandElements[$i].Extent.Text.Trim()
    }
  }
  $commandObjects += [PSCustomObject]@{
    name = $name
    text = $commandAst.Extent.Text.Trim()
    startIndex = $commandAst.Extent.StartOffset
    args = @($cmdArgs)
  }
}
$staticInvocations = $ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] -and (
    $node.Expression -is [System.Management.Automation.Language.TypeExpressionAst] -or
    $node.Expression -is [System.Management.Automation.Language.ScriptBlockExpressionAst] -or
    $node.Expression -is [System.Management.Automation.Language.ConvertExpressionAst] -or (
      $node.Expression -is [System.Management.Automation.Language.ParenExpressionAst] -and
      $node.Expression.Pipeline.FindAll({
        param($inner)
        $inner -is [System.Management.Automation.Language.ConvertExpressionAst] -or
        $inner -is [System.Management.Automation.Language.ScriptBlockExpressionAst]
      }, $true).Count -gt 0
    )
  )
}, $true)
foreach ($invokeAst in $staticInvocations) {
  $invokeText = $invokeAst.Extent.Text.Trim()
  $commandObjects += [PSCustomObject]@{
    name = $invokeText
    text = $invokeText
    startIndex = $invokeAst.Extent.StartOffset
    args = @()
  }
}
$hasSubExpr = $ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.SubExpressionAst] -or
  $node -is [System.Management.Automation.Language.ArrayExpressionAst] -or
  ($node -is [System.Management.Automation.Language.ParenExpressionAst] -and
   $node.Pipeline.FindAll({ param($p) $p -is [System.Management.Automation.Language.CommandAst] }, $false).Count -gt 0)
}, $true).Count -gt 0
[PSCustomObject]@{
  success = $true
  commands = @($commandObjects)
  hasRedirection = $hasRedirection
  hasCommandSubstitution = $hasSubExpr
} | ConvertTo-Json -Compress -Depth 4
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

    interface RawPowerShellCommand {
      name?: string;
      text?: string;
      startIndex?: number;
      args?: string[];
    }

    let parsed: {
      success?: boolean;
      commands?: RawPowerShellCommand[] | RawPowerShellCommand;
      hasRedirection?: boolean;
      hasCommandSubstitution?: boolean;
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

    const rawCommands = Array.isArray(parsed.commands)
      ? parsed.commands
      : parsed.commands
        ? [parsed.commands]
        : [];

    const details = rawCommands
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
          startIndex:
            typeof commandDetail.startIndex === 'number'
              ? commandDetail.startIndex
              : 0,
          args: Array.isArray(commandDetail.args)
            ? commandDetail.args
            : undefined,
        };
      })
      .filter((detail): detail is ParsedCommandDetail => detail !== null)
      .sort((a, b) => a.startIndex - b.startIndex);

    return {
      details,
      hasError: details.length === 0,
      hasRedirection: parsed.hasRedirection,
      hasCommandSubstitution: parsed.hasCommandSubstitution ?? false,
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
      // Never fall back to the Bash parser when PowerShell command substitution
      // is detected, because Bash and PowerShell have incompatible quoting,
      // escaping, and subexpression grammars (e.g. @(...), bare (...)
      // subexpressions, backtick escapes, and Unicode quotes).
      if (detectPowerShellSubstitution(command)) {
        return result ?? { details: [], hasError: true };
      }
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
        argsPrefix: powershellArgsPrefix,
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

const PS_WRAPPER_FLAGS = new Set([
  '-nologo',
  '-noprofile',
  '-noninteractive',
  '-nol',
  '-nop',
  '-noni',
]);

function unescapePowerShellBacktickChar(ch: string): string {
  switch (ch) {
    case '0':
      return '\0';
    case 'a':
      return '\x07';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'v':
      return '\v';
    default:
      return ch;
  }
}

function readWrapperToken(
  command: string,
  startIndex: number,
): { value: string; quoted: boolean; nextIndex: number } | null {
  let i = startIndex;
  while (i < command.length && /\s/.test(command[i])) {
    i++;
  }
  if (i >= command.length) {
    return null;
  }
  const quote = command[i];
  if (quote === '"' || quote === "'") {
    const closeIdx = command.indexOf(quote, i + 1);
    if (closeIdx === -1) {
      return null;
    }
    const afterQuote = closeIdx + 1;
    if (afterQuote < command.length && !/\s/.test(command[afterQuote])) {
      return null;
    }
    return {
      value: command.slice(i + 1, closeIdx),
      quoted: true,
      nextIndex: afterQuote,
    };
  }
  let end = i;
  while (end < command.length && !/\s/.test(command[end])) {
    end++;
  }
  return {
    value: command.slice(i, end),
    quoted: false,
    nextIndex: end,
  };
}

function unwrapCmdCommandArg(rawArg: string): string | null {
  if (rawArg.startsWith('"') && rawArg.endsWith('"')) {
    let out = '';
    let j = 1;
    const end = rawArg.length - 1;
    while (j < end) {
      const ch = rawArg[j];
      if (ch === '\\') {
        let bsEnd = j;
        while (bsEnd < end && rawArg[bsEnd] === '\\') {
          bsEnd++;
        }
        const bsCount = bsEnd - j;
        if (bsEnd === end) {
          if (bsCount % 2 === 1) {
            return null;
          }
          out += '\\'.repeat(bsCount / 2);
          j = bsEnd;
          break;
        }
        if (rawArg[bsEnd] === '"') {
          if (bsCount % 2 === 1) {
            out += '\\'.repeat((bsCount - 1) / 2) + '"';
            j = bsEnd + 1;
            continue;
          }
          if (bsEnd + 1 < end && rawArg[bsEnd + 1] === '"') {
            out += '\\'.repeat(bsCount / 2) + '"';
            j = bsEnd + 2;
            continue;
          }
          return null;
        }
        out += '\\'.repeat(bsCount);
        j = bsEnd;
        continue;
      }
      if (ch === '"') {
        if (j + 1 < end && rawArg[j + 1] === '"') {
          out += '"';
          j += 2;
          continue;
        }
        return null;
      }
      out += ch;
      j++;
    }
    return out;
  }

  if (rawArg.startsWith("'") && rawArg.endsWith("'")) {
    const inner = rawArg.slice(1, -1);
    return inner.includes("'") ? null : inner;
  }

  return rawArg;
}

function unwrapPowerShellCommandArg(rawArg: string): string | null {
  if (rawArg.startsWith("'") && rawArg.endsWith("'")) {
    let j = 1;
    while (j < rawArg.length - 1) {
      if (rawArg[j] === "'") {
        if (rawArg[j + 1] === "'" && j + 1 < rawArg.length - 1) {
          j += 2;
          continue;
        }
        return null;
      }
      j++;
    }
    return rawArg.slice(1, -1).replace(/''/g, "'");
  }

  if (rawArg.startsWith('"') && rawArg.endsWith('"')) {
    let outerHasSubExpression = false;
    let out = '';
    let j = 1;
    const end = rawArg.length - 1;
    while (j < end) {
      const ch = rawArg[j];
      if (ch === '\\') {
        let bsEnd = j;
        while (bsEnd < end && rawArg[bsEnd] === '\\') {
          bsEnd++;
        }
        const bsCount = bsEnd - j;
        if (bsEnd === end) {
          if (bsCount % 2 === 1) {
            return null;
          }
          out += '\\'.repeat(bsCount / 2);
          j = bsEnd;
          break;
        }
        if (rawArg[bsEnd] === '"') {
          if (bsCount % 2 === 1) {
            out += '\\'.repeat((bsCount - 1) / 2) + '"';
            j = bsEnd + 1;
            continue;
          }
          if (bsEnd + 1 < end && rawArg[bsEnd + 1] === '"') {
            out += '\\'.repeat(bsCount / 2) + '"';
            j = bsEnd + 2;
            continue;
          }
          return null;
        }
        out += '\\'.repeat(bsCount);
        j = bsEnd;
        continue;
      }
      if (ch === '`') {
        if (j + 1 >= end) {
          return null;
        }
        out += unescapePowerShellBacktickChar(rawArg[j + 1]);
        j += 2;
        continue;
      }
      if (ch === '"') {
        if (j + 1 < end && rawArg[j + 1] === '"') {
          out += '"';
          j += 2;
          continue;
        }
        return null;
      }
      if (ch === '$' && j + 1 < end && rawArg[j + 1] === '{') {
        const afterBrace = Math.min(
          skipPowerShellBracedVariable(rawArg, j),
          end,
        );
        out += rawArg.slice(j, afterBrace);
        j = afterBrace;
        continue;
      }
      if (ch === '$' && j + 1 < end && rawArg[j + 1] === '(') {
        outerHasSubExpression = true;
      }
      out += ch;
      j++;
    }
    if (outerHasSubExpression && !detectPowerShellSubstitution(out)) {
      return null;
    }
    return out;
  }

  return rawArg;
}

function stripSingleShellWrapper(command: string): string {
  const exeToken = readWrapperToken(command, 0);
  if (!exeToken) {
    return command.trim();
  }

  if (!exeToken.quoted && !exeToken.value.includes('\\')) {
    const posixBase = exeToken.value
      .slice(exeToken.value.lastIndexOf('/') + 1)
      .toLowerCase();
    if (posixBase === 'sh' || posixBase === 'bash' || posixBase === 'zsh') {
      const flagToken = readWrapperToken(command, exeToken.nextIndex);
      if (
        flagToken &&
        !flagToken.quoted &&
        flagToken.value.toLowerCase() === '-c' &&
        flagToken.nextIndex < command.length &&
        /\s/.test(command[flagToken.nextIndex])
      ) {
        const newCommand = command.substring(flagToken.nextIndex).trim();
        if (newCommand.length >= 2) {
          if (newCommand.startsWith('"') && newCommand.endsWith('"')) {
            const outerHasSubstitution = detectBashSubstitution(newCommand);
            let unwrapped: string | null = null;
            try {
              const parsed = parse(newCommand, (key) => '$' + key);
              const firstEntry = parsed[0];
              if (parsed.length === 1 && typeof firstEntry === 'string') {
                unwrapped = firstEntry;
              } else if (parsed.length > 1) {
                return command.trim();
              }
            } catch {
              // Fall through to simple outer quote removal below.
            }
            const candidate = unwrapped ?? newCommand.slice(1, -1);
            if (outerHasSubstitution && !detectBashSubstitution(candidate)) {
              return command.trim();
            }
            return candidate;
          }
          if (newCommand.startsWith("'") && newCommand.endsWith("'")) {
            const inner = newCommand.slice(1, -1);
            if (!inner.includes("'")) {
              return inner;
            }
            return command.trim();
          }
        }
        return newCommand;
      }
    }
  }

  const winBase = exeToken.value
    .slice(
      Math.max(
        exeToken.value.lastIndexOf('/'),
        exeToken.value.lastIndexOf('\\'),
      ) + 1,
    )
    .toLowerCase();

  if (winBase === 'cmd' || winBase === 'cmd.exe') {
    let cursor = exeToken.nextIndex;
    while (cursor < command.length) {
      const flagToken = readWrapperToken(command, cursor);
      if (!flagToken || flagToken.quoted) {
        break;
      }
      const lowerFlag = flagToken.value.toLowerCase();
      if (lowerFlag === '/d' || lowerFlag === '/s') {
        cursor = flagToken.nextIndex;
        continue;
      }
      if (
        lowerFlag === '/c' &&
        flagToken.nextIndex < command.length &&
        /\s/.test(command[flagToken.nextIndex])
      ) {
        const newCommand = command.substring(flagToken.nextIndex).trim();
        if (newCommand.length >= 2) {
          const unwrapped = unwrapCmdCommandArg(newCommand);
          return unwrapped === null ? command.trim() : unwrapped;
        }
        return newCommand;
      }
      break;
    }
  }

  if (
    winBase === 'powershell' ||
    winBase === 'powershell.exe' ||
    winBase === 'pwsh' ||
    winBase === 'pwsh.exe'
  ) {
    let cursor = exeToken.nextIndex;
    while (cursor < command.length) {
      const flagToken = readWrapperToken(command, cursor);
      if (!flagToken || flagToken.quoted) {
        break;
      }
      const lowerFlag = flagToken.value.toLowerCase();
      if (PS_WRAPPER_FLAGS.has(lowerFlag)) {
        cursor = flagToken.nextIndex;
        continue;
      }
      if (
        (lowerFlag === '-command' || lowerFlag === '-c') &&
        flagToken.nextIndex < command.length &&
        /\s/.test(command[flagToken.nextIndex])
      ) {
        const newCommand = command.substring(flagToken.nextIndex).trim();
        if (newCommand.length >= 2) {
          const unwrapped = unwrapPowerShellCommandArg(newCommand);
          return unwrapped === null ? command.trim() : unwrapped;
        }
        return newCommand;
      }
      break;
    }
  }

  return command.trim();
}

export function stripShellWrapper(command: string): string {
  let current = command.trim();
  const MAX_WRAPPER_DEPTH = 5;
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth++) {
    const next = stripSingleShellWrapper(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
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

function isAsciiIdentStart(ch: string | undefined): boolean {
  return (
    ch !== undefined &&
    ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_')
  );
}

function isAsciiWordChar(ch: string | undefined): boolean {
  return isAsciiIdentStart(ch) || (ch !== undefined && ch >= '0' && ch <= '9');
}

function isPowerShellDash(ch: string | undefined): boolean {
  return ch === '-' || ch === '\u2013' || ch === '\u2014' || ch === '\u2015';
}

function isPowerShellSingleQuote(ch: string | undefined): boolean {
  return (
    ch === "'" ||
    ch === '\u2018' ||
    ch === '\u2019' ||
    ch === '\u201a' ||
    ch === '\u201b'
  );
}

function isPowerShellDoubleQuote(ch: string | undefined): boolean {
  return ch === '"' || ch === '\u201c' || ch === '\u201d' || ch === '\u201e';
}

function isPowerShellNewline(ch: string | undefined): boolean {
  return ch === '\n' || ch === '\r';
}

function findPowerShellSingleHereStringEnd(
  command: string,
  startAfterNewline: number,
): number {
  let idx = startAfterNewline;
  // Handle immediate empty here-string where startAfterNewline is already at line start
  while (idx < command.length) {
    const atLineStart =
      idx === startAfterNewline || isPowerShellNewline(command[idx - 1]);
    if (
      atLineStart &&
      isPowerShellSingleQuote(command[idx]) &&
      command[idx + 1] === '@'
    ) {
      return idx + 2;
    }
    idx++;
  }
  return -1;
}

function skipPowerShellBracedVariable(
  command: string,
  dollarIndex: number,
): number {
  let k = dollarIndex + 2;
  while (k < command.length) {
    if (command[k] === '`' && k + 1 < command.length) {
      k += 2;
      continue;
    }
    if (command[k] === '}') {
      return k + 1;
    }
    k++;
  }
  return command.length;
}

function isPowerShellMemberOrTypeCallBeforeParen(
  command: string,
  openIndex: number,
): boolean {
  let p = openIndex - 1;
  while (p >= 0 && isAsciiWordChar(command[p])) {
    p--;
  }
  const methodStart = p + 1;
  if (methodStart >= openIndex || !isAsciiIdentStart(command[methodStart])) {
    return false;
  }

  if (p >= 2 && command[p] === ':' && command[p - 1] === ':') {
    const recv = command[p - 2];
    return (
      recv === ']' ||
      recv === ')' ||
      isAsciiWordChar(recv) ||
      isPowerShellSingleQuote(recv) ||
      isPowerShellDoubleQuote(recv)
    );
  }

  if (p <= 0 || command[p] !== '.') {
    return false;
  }

  let dotIdx = p;
  while (dotIdx > 0 && command[dotIdx] === '.') {
    let q = dotIdx - 1;
    while (q >= 0 && isAsciiWordChar(command[q])) {
      q--;
    }
    const segStart = q + 1;
    if (
      segStart < dotIdx &&
      isAsciiIdentStart(command[segStart]) &&
      q >= 0 &&
      command[q] === '.'
    ) {
      dotIdx = q;
      continue;
    }
    break;
  }

  if (dotIdx <= 0) {
    return false;
  }

  const recvEnd = dotIdx - 1;
  const recvChar = command[recvEnd];
  if (
    recvChar === ')' ||
    recvChar === ']' ||
    isPowerShellSingleQuote(recvChar) ||
    isPowerShellDoubleQuote(recvChar)
  ) {
    return true;
  }

  let v = recvEnd;
  while (v >= 0 && (isAsciiWordChar(command[v]) || command[v] === ':')) {
    v--;
  }
  return v < recvEnd && v >= 0 && command[v] === '$';
}

function isAtPowerShellStatementBoundary(
  command: string,
  tokenStart: number,
): boolean {
  let b = tokenStart - 1;
  while (
    b >= 0 &&
    command[b] !== '\r' &&
    command[b] !== '\n' &&
    /\s/.test(command[b])
  ) {
    b--;
  }
  if (b < 0) {
    return true;
  }
  const prev = command[b];
  if (
    prev === ';' ||
    prev === '{' ||
    prev === '}' ||
    prev === '|' ||
    prev === '\r' ||
    prev === '\n' ||
    prev === '('
  ) {
    return true;
  }
  let w = b;
  while (w >= 0 && isAsciiIdentStart(command[w])) {
    w--;
  }
  const word = command.slice(w + 1, b + 1).toLowerCase();
  return (
    (word === 'else' || word === 'do') &&
    (w < 0 || !isAsciiWordChar(command[w]))
  );
}

const POWERSHELL_PAREN_KEYWORDS = new Set([
  'if',
  'elseif',
  'foreach',
  'for',
  'while',
  'switch',
  'catch',
  'until',
  'trap',
  'function',
  'filter',
  'param',
]);

function isPowerShellKeywordBeforeParen(
  command: string,
  openIndex: number,
): boolean {
  let p = openIndex - 1;
  while (
    p >= 0 &&
    command[p] !== '\r' &&
    command[p] !== '\n' &&
    /\s/.test(command[p])
  ) {
    p--;
  }
  if (p < 0) {
    return false;
  }

  let tStart = p;
  while (
    tStart >= 0 &&
    (isAsciiWordChar(command[tStart]) ||
      isPowerShellDash(command[tStart]) ||
      command[tStart] === ':')
  ) {
    tStart--;
  }
  tStart++;
  if (tStart > p) {
    return false;
  }

  const lastToken = command.slice(tStart, p + 1);
  const lowerLast = lastToken.toLowerCase();
  if (POWERSHELL_PAREN_KEYWORDS.has(lowerLast)) {
    return isAtPowerShellStatementBoundary(command, tStart);
  }

  // Case A: switch / foreach followed by one or more -Flag tokens (e.g. switch -Regex -CaseSensitive ($x))
  if (isPowerShellDash(lastToken[0]) && lastToken.length > 1) {
    let cursor = tStart - 1;
    while (cursor >= 0) {
      while (
        cursor >= 0 &&
        command[cursor] !== '\r' &&
        command[cursor] !== '\n' &&
        /\s/.test(command[cursor])
      ) {
        cursor--;
      }
      if (cursor < 0) {
        return false;
      }
      let prevStart = cursor;
      while (
        prevStart >= 0 &&
        (isAsciiWordChar(command[prevStart]) ||
          isPowerShellDash(command[prevStart]) ||
          command[prevStart] === ':')
      ) {
        prevStart--;
      }
      prevStart++;
      if (prevStart > cursor) {
        return false;
      }
      const prevTok = command.slice(prevStart, cursor + 1);
      const lowerPrev = prevTok.toLowerCase();
      if (lowerPrev === 'switch' || lowerPrev === 'foreach') {
        return isAtPowerShellStatementBoundary(command, prevStart);
      }
      if (!isPowerShellDash(prevTok[0]) || prevTok.length <= 1) {
        return false;
      }
      cursor = prevStart - 1;
    }
    return false;
  }

  // Case B: function <name> (...) or filter <name> (...)
  let q = tStart - 1;
  while (
    q >= 0 &&
    command[q] !== '\r' &&
    command[q] !== '\n' &&
    /\s/.test(command[q])
  ) {
    q--;
  }
  if (q < 0) {
    return false;
  }
  let kwStart = q;
  while (kwStart >= 0 && isAsciiIdentStart(command[kwStart])) {
    kwStart--;
  }
  kwStart++;
  if (kwStart > q) {
    return false;
  }
  const kw = command.slice(kwStart, q + 1).toLowerCase();
  return (
    (kw === 'function' || kw === 'filter') &&
    isAtPowerShellStatementBoundary(command, kwStart)
  );
}

function isPowerShellKeywordNestedParen(
  command: string,
  openIndex: number,
): boolean {
  let p = openIndex - 1;
  while (p >= 0 && /\s/.test(command[p])) {
    p--;
  }
  if (p < 0) {
    return false;
  }
  const prev = command[p];
  if (prev === '(' || prev === ';' || prev === '!') {
    return true;
  }
  let q = p;
  while (
    q >= 0 &&
    ((command[q] >= 'A' && command[q] <= 'Z') ||
      (command[q] >= 'a' && command[q] <= 'z'))
  ) {
    q--;
  }
  if (q < p && q >= 0 && isPowerShellDash(command[q])) {
    return (
      q === 0 ||
      /\s/.test(command[q - 1]) ||
      command[q - 1] === '(' ||
      command[q - 1] === ';'
    );
  }
  return false;
}

function findPowerShellExprValueStart(
  command: string,
  startIndex: number,
): number {
  let k = startIndex;
  while (k < command.length) {
    while (k < command.length && /\s/.test(command[k])) {
      k++;
    }
    if (command[k] === '(' || command[k] === '!') {
      k++;
      continue;
    }
    if (isPowerShellDash(command[k])) {
      const nextSlice = command.slice(k + 1, k + 6).toLowerCase();
      if (nextSlice.startsWith('not') && !isAsciiWordChar(command[k + 4])) {
        k += 4;
        continue;
      }
      if (nextSlice.startsWith('bnot') && !isAsciiWordChar(command[k + 5])) {
        k += 5;
        continue;
      }
    }
    break;
  }
  return k;
}

function startsWithPowerShellVarOrNumberAt(
  command: string,
  index: number,
): boolean {
  if (index >= command.length) {
    return false;
  }
  if (command[index] >= '0' && command[index] <= '9') {
    return true;
  }
  return (
    command[index] === '$' &&
    index + 1 < command.length &&
    (isAsciiIdentStart(command[index + 1]) || command[index + 1] === '{')
  );
}

function findPurePowerShellExpressionParenClose(
  command: string,
  openIndex: number,
): number {
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let j = openIndex + 1;
  while (j < command.length && depth > 0) {
    const ch = command[j];
    if (inSingle) {
      if (
        isPowerShellSingleQuote(ch) &&
        isPowerShellSingleQuote(command[j + 1])
      ) {
        j += 2;
        continue;
      }
      if (isPowerShellSingleQuote(ch)) {
        inSingle = false;
      }
      j++;
      continue;
    }
    if (inDouble) {
      if (ch === '`' && j + 1 < command.length) {
        j += 2;
        continue;
      }
      if (
        isPowerShellDoubleQuote(ch) &&
        isPowerShellDoubleQuote(command[j + 1])
      ) {
        j += 2;
        continue;
      }
      if (isPowerShellDoubleQuote(ch)) {
        inDouble = false;
      }
      j++;
      continue;
    }
    if (ch === '`' && j + 1 < command.length) {
      j += 2;
      continue;
    }
    if (isPowerShellSingleQuote(ch)) {
      inSingle = true;
      j++;
      continue;
    }
    if (isPowerShellDoubleQuote(ch)) {
      inDouble = true;
      j++;
      continue;
    }
    // Reject pipelines, statement separators, assignments, redirections,
    // comments, and here-strings (prevents comment-spoofed closing parens like ($a <# ) #> ; whoami)).
    if (
      ch === '|' ||
      ch === ';' ||
      ch === '=' ||
      ch === '<' ||
      ch === '>' ||
      ch === '#' ||
      (ch === '@' &&
        (isPowerShellSingleQuote(command[j + 1]) ||
          isPowerShellDoubleQuote(command[j + 1])))
    ) {
      return -1;
    }
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    }
    j++;
  }

  return depth === 0 ? j - 1 : -1;
}

function detectPowerShellSubstitution(command: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDoubleHereString = false;
  const parenStack: Array<'keyword' | 'method' | 'expr'> = [];
  let pureExprPrefixTarget = -1;
  let pureExprSafeCloseUntil = -1;
  let i = 0;

  while (i < command.length) {
    const char = command[i];

    if (inDoubleHereString) {
      if (
        isPowerShellNewline(command[i - 1]) &&
        isPowerShellDoubleQuote(char) &&
        command[i + 1] === '@'
      ) {
        inDoubleHereString = false;
        i += 2;
        continue;
      }
      if (char === '`' && i + 1 < command.length) {
        i += 2;
        continue;
      }
      if (char === '$' && command[i + 1] === '{') {
        i = skipPowerShellBracedVariable(command, i);
        continue;
      }
      if (char === '$' && command[i + 1] === '(') {
        return true;
      }
      i++;
      continue;
    }

    if (inSingleQuote) {
      if (
        isPowerShellSingleQuote(char) &&
        isPowerShellSingleQuote(command[i + 1])
      ) {
        i += 2;
        continue;
      }
      if (isPowerShellSingleQuote(char)) {
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '`' && i + 1 < command.length) {
        i += 2;
        continue;
      }
      if (
        isPowerShellDoubleQuote(char) &&
        isPowerShellDoubleQuote(command[i + 1])
      ) {
        i += 2;
        continue;
      }
      if (isPowerShellDoubleQuote(char)) {
        inDoubleQuote = false;
        i++;
        continue;
      }
      if (char === '$' && command[i + 1] === '{') {
        i = skipPowerShellBracedVariable(command, i);
        continue;
      }
      if (char === '$' && command[i + 1] === '(') {
        return true;
      }
      i++;
      continue;
    }

    // Unquoted state: handle PowerShell here-strings (@' ... '@ and @" ... "@)
    // Only valid at a token boundary (never mid-argument like foo@'\n$(whoami)\n'@).
    if (
      char === '@' &&
      (i === 0 || /[\s=;,({|&!+\-*/%]/.test(command[i - 1])) &&
      (isPowerShellSingleQuote(command[i + 1]) ||
        isPowerShellDoubleQuote(command[i + 1]))
    ) {
      const quoteChar = command[i + 1];
      const newlineLen =
        command[i + 2] === '\r' && command[i + 3] === '\n'
          ? 2
          : isPowerShellNewline(command[i + 2])
            ? 1
            : 0;
      if (newlineLen > 0) {
        if (isPowerShellSingleQuote(quoteChar)) {
          const endIdx = findPowerShellSingleHereStringEnd(
            command,
            i + 2 + newlineLen,
          );
          if (endIdx !== -1) {
            i = endIdx;
            continue;
          }
        } else {
          inDoubleHereString = true;
          i += 2 + newlineLen;
          continue;
        }
      }
    }

    // Block comments <# ... #> (only valid at a token boundary)
    if (
      char === '<' &&
      command[i + 1] === '#' &&
      (i === 0 || /[\s;(){}|]/.test(command[i - 1]))
    ) {
      const closeComment = command.indexOf('#>', i + 2);
      if (closeComment !== -1) {
        i = closeComment + 2;
        continue;
      }
      return false;
    }

    // Single-line comments # ... (at start of command or after token boundary)
    if (char === '#' && (i === 0 || /[\s;(){}|]/.test(command[i - 1]))) {
      while (i < command.length && !isPowerShellNewline(command[i])) {
        i++;
      }
      continue;
    }

    if (isPowerShellSingleQuote(char)) {
      inSingleQuote = true;
      i++;
      continue;
    }
    if (isPowerShellDoubleQuote(char)) {
      inDoubleQuote = true;
      i++;
      continue;
    }
    if (char === '`' && i + 1 < command.length) {
      i += 2;
      continue;
    }
    if (char === '$' && command[i + 1] === '{') {
      i = skipPowerShellBracedVariable(command, i);
      continue;
    }
    if (char === '$' && command[i + 1] === '(') {
      return true;
    }
    if (char === '@' && command[i + 1] === '(') {
      return true;
    }
    if (char === ')') {
      parenStack.pop();
      i++;
      continue;
    }
    if (char === '(') {
      const enclosingParen = parenStack[parenStack.length - 1];

      if (isPowerShellMemberOrTypeCallBeforeParen(command, i)) {
        parenStack.push('method');
        i++;
        continue;
      }
      if (isPowerShellKeywordBeforeParen(command, i)) {
        parenStack.push('keyword');
        i++;
        continue;
      }
      if (
        enclosingParen === 'keyword' &&
        isPowerShellKeywordNestedParen(command, i)
      ) {
        parenStack.push('keyword');
        i++;
        continue;
      }

      let hasValidExprPrefix = i < pureExprPrefixTarget;
      if (!hasValidExprPrefix) {
        const valueStart = findPowerShellExprValueStart(command, i + 1);
        if (startsWithPowerShellVarOrNumberAt(command, valueStart)) {
          hasValidExprPrefix = true;
          pureExprPrefixTarget = valueStart;
        }
      }

      if (hasValidExprPrefix) {
        if (i < pureExprSafeCloseUntil) {
          parenStack.push('expr');
          i++;
          continue;
        }
        const closeIndex = findPurePowerShellExpressionParenClose(command, i);
        if (closeIndex !== -1) {
          pureExprSafeCloseUntil = Math.max(pureExprSafeCloseUntil, closeIndex);
          parenStack.push('expr');
          i++;
          continue;
        }
      }

      return true;
    }

    i++;
  }
  return false;
}
