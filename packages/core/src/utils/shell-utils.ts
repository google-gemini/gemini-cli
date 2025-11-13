/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnyToolInvocation } from '../index.js';
import type { Config } from '../config/config.js';
import os from 'node:os';
import { quote } from 'shell-quote';
import { doesToolInvocationMatch } from './tool-utils.js';
import {
  spawn,
  spawnSync,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import type { Node } from 'web-tree-sitter';
import { Language, Parser } from 'web-tree-sitter';
import { loadWasmBinary } from './fileUtils.js';

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
      throw error;
    });
  }

  await treeSitterInitialization;
}

interface ParsedCommandDetail {
  name: string;
  text: string;
}

interface CommandParseResult {
  details: ParsedCommandDetail[];
  hasError: boolean;
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
foreach ($commandAst in $commandAsts) {
  $name = $commandAst.GetCommandName()
  if ([string]::IsNullOrWhiteSpace($name)) {
    continue
  }
  $commandObjects += [PSCustomObject]@{
    name = $name
    text = $commandAst.Extent.Text.Trim()
  }
}
[PSCustomObject]@{
  success = $true
  commands = $commandObjects
} | ConvertTo-Json -Compress
`,
  'utf16le',
).toString('base64');

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

function parseCommandTree(command: string) {
  const parser = createParser();
  if (!parser || !command.trim()) {
    return null;
  }

  try {
    return parser.parse(command);
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
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.split(/[\\/]/).pop() ?? trimmed;
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
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const commandName = extractNameFromNode(current);
    if (commandName) {
      details.push({
        name: commandName,
        text: source.slice(current.startIndex, current.endIndex).trim(),
      });
    }

    for (let i = current.namedChildCount - 1; i >= 0; i -= 1) {
      const child = current.namedChild(i);
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
          operatorNode?.type === '@' &&
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

function parseBashCommandDetails(command: string): CommandParseResult | null {
  if (treeSitterInitializationError) {
    throw treeSitterInitializationError;
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
  return {
    details,
    hasError:
      tree.rootNode.hasError ||
      details.length === 0 ||
      hasPromptCommandTransform(tree.rootNode),
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
      commands?: Array<{ name?: string; text?: string }>;
    } | null = null;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { details: [], hasError: true };
    }

    if (!parsed?.success) {
      return { details: [], hasError: true };
    }

    const details = (parsed.commands ?? [])
      .map((commandDetail) => {
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
        };
      })
      .filter((detail): detail is ParsedCommandDetail => detail !== null);

    return {
      details,
      hasError: details.length === 0,
    };
  } catch {
    return null;
  }
}

function parseCommandDetails(command: string): CommandParseResult | null {
  const configuration = getShellConfiguration();

  if (configuration.shell === 'powershell') {
    return parsePowerShellCommandDetails(command, configuration.executable);
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
 * @returns The ShellConfiguration for the current environment.
 */
export function getShellConfiguration(): ShellConfiguration {
  if (isWindows()) {
    const comSpec = process.env['ComSpec'];
    if (comSpec) {
      const executable = comSpec.toLowerCase();
      if (
        executable.endsWith('powershell.exe') ||
        executable.endsWith('pwsh.exe')
      ) {
        return {
          executable: comSpec,
          argsPrefix: ['-NoProfile', '-Command'],
          shell: 'powershell',
        };
      }
    }

    // Default to PowerShell for all other Windows configurations.
    return {
      executable: 'powershell.exe',
      argsPrefix: ['-NoProfile', '-Command'],
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
      // For PowerShell, wrap in single quotes and escape internal single quotes by doubling them.
      return `'${arg.replace(/'/g, "''")}'`;
    case 'cmd':
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
export function splitCommands(command: string): string[] {
  const parsed = parseCommandDetails(command);
  if (!parsed || parsed.hasError) {
    return [];
  }

  return parsed.details.map((detail) => detail.text).filter(Boolean);
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

  return parsed.details.map((detail) => detail.name).filter(Boolean);
}

export function stripShellWrapper(command: string): string {
  const pattern =
    /^\s*(?:(?:sh|bash|zsh)\s+-c|cmd\.exe\s+\/c|powershell(?:\.exe)?\s+(?:-NoProfile\s+)?-Command|pwsh(?:\.exe)?\s+(?:-NoProfile\s+)?-Command)\s+/i;
  const match = command.match(pattern);
  if (match) {
    let newCommand = command.substring(match[0].length).trim();
    if (
      (newCommand.startsWith('"') && newCommand.endsWith('"')) ||
      (newCommand.startsWith("'") && newCommand.endsWith("'"))
    ) {
      newCommand = newCommand.substring(1, newCommand.length - 1);
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
 * Checks a shell command against security policies and allowlists.
 *
 * This function operates in one of two modes depending on the presence of
 * the `sessionAllowlist` parameter:
 *
 * 1.  **"Default Deny" Mode (sessionAllowlist is provided):** This is the
 *     strictest mode, used for user-defined scripts like custom commands.
 *     A command is only permitted if it is found on the global `coreTools`
 *     allowlist OR the provided `sessionAllowlist`. It must not be on the
 *     global `excludeTools` blocklist.
 *
 * 2.  **"Default Allow" Mode (sessionAllowlist is NOT provided):** This mode
 *     is used for direct tool invocations (e.g., by the model). If a strict
 *     global `coreTools` allowlist exists, commands must be on it. Otherwise,
 *     any command is permitted as long as it is not on the `excludeTools`
 *     blocklist.
 *
 * @param command The shell command string to validate.
 * @param config The application configuration.
 * @param sessionAllowlist A session-level list of approved commands. Its
 *   presence activates "Default Deny" mode.
 * @returns An object detailing which commands are not allowed.
 */
export function checkCommandPermissions(
  command: string,
  config: Config,
  sessionAllowlist?: Set<string>,
): {
  allAllowed: boolean;
  disallowedCommands: string[];
  blockReason?: string;
  isHardDenial?: boolean;
} {
  const parseResult = parseCommandDetails(command);
  if (!parseResult || parseResult.hasError) {
    return {
      allAllowed: false,
      disallowedCommands: [command],
      blockReason: 'Command rejected because it could not be parsed safely',
      isHardDenial: true,
    };
  }

  const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');
  const commandsToValidate = parseResult.details
    .map((detail) => normalize(detail.text))
    .filter(Boolean);
  const invocation: AnyToolInvocation & { params: { command: string } } = {
    params: { command: '' },
  } as AnyToolInvocation & { params: { command: string } };

  // 1. Blocklist Check (Highest Priority)
  const excludeTools = config.getExcludeTools() || new Set([]);
  const isWildcardBlocked = SHELL_TOOL_NAMES.some((name) =>
    excludeTools.has(name),
  );

  if (isWildcardBlocked) {
    return {
      allAllowed: false,
      disallowedCommands: commandsToValidate,
      blockReason: 'Shell tool is globally disabled in configuration',
      isHardDenial: true,
    };
  }

  for (const cmd of commandsToValidate) {
    invocation.params['command'] = cmd;
    if (
      doesToolInvocationMatch('run_shell_command', invocation, [
        ...excludeTools,
      ])
    ) {
      return {
        allAllowed: false,
        disallowedCommands: [cmd],
        blockReason: `Command '${cmd}' is blocked by configuration`,
        isHardDenial: true,
      };
    }
  }

  const coreTools = config.getCoreTools() || [];
  const isWildcardAllowed = SHELL_TOOL_NAMES.some((name) =>
    coreTools.includes(name),
  );

  // If there's a global wildcard, all commands are allowed at this point
  // because they have already passed the blocklist check.
  if (isWildcardAllowed) {
    return { allAllowed: true, disallowedCommands: [] };
  }

  const disallowedCommands: string[] = [];

  if (sessionAllowlist) {
    // "DEFAULT DENY" MODE: A session allowlist is provided.
    // All commands must be in either the session or global allowlist.
    const normalizedSessionAllowlist = new Set(
      [...sessionAllowlist].flatMap((cmd) =>
        SHELL_TOOL_NAMES.map((name) => `${name}(${cmd})`),
      ),
    );

    for (const cmd of commandsToValidate) {
      invocation.params['command'] = cmd;
      const isSessionAllowed = doesToolInvocationMatch(
        'run_shell_command',
        invocation,
        [...normalizedSessionAllowlist],
      );
      if (isSessionAllowed) continue;

      const isGloballyAllowed = doesToolInvocationMatch(
        'run_shell_command',
        invocation,
        coreTools,
      );
      if (isGloballyAllowed) continue;

      disallowedCommands.push(cmd);
    }

    if (disallowedCommands.length > 0) {
      return {
        allAllowed: false,
        disallowedCommands,
        blockReason: `Command(s) not on the global or session allowlist. Disallowed commands: ${disallowedCommands
          .map((c) => JSON.stringify(c))
          .join(', ')}`,
        isHardDenial: false, // This is a soft denial; confirmation is possible.
      };
    }
  } else {
    // "DEFAULT ALLOW" MODE: No session allowlist.
    const hasSpecificAllowedCommands =
      coreTools.filter((tool) =>
        SHELL_TOOL_NAMES.some((name) => tool.startsWith(`${name}(`)),
      ).length > 0;

    if (hasSpecificAllowedCommands) {
      for (const cmd of commandsToValidate) {
        invocation.params['command'] = cmd;
        const isGloballyAllowed = doesToolInvocationMatch(
          'run_shell_command',
          invocation,
          coreTools,
        );
        if (!isGloballyAllowed) {
          disallowedCommands.push(cmd);
        }
      }
      if (disallowedCommands.length > 0) {
        return {
          allAllowed: false,
          disallowedCommands,
          blockReason: `Command(s) not in the allowed commands list. Disallowed commands: ${disallowedCommands
            .map((c) => JSON.stringify(c))
            .join(', ')}`,
          isHardDenial: false, // This is a soft denial.
        };
      }
    }
    // If no specific global allowlist exists, and it passed the blocklist,
    // the command is allowed by default.
  }

  // If all checks for the current mode pass, the command is allowed.
  return { allAllowed: true, disallowedCommands: [] };
}

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
export const spawnAsync = (
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
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
        reject(new Error(`Command failed with exit code ${code}:\n${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });

export function isCommandAllowed(
  command: string,
  config: Config,
): { allowed: boolean; reason?: string } {
  // By not providing a sessionAllowlist, we invoke "default allow" behavior.
  const { allAllowed, blockReason } = checkCommandPermissions(command, config);
  if (allAllowed) {
    return { allowed: true };
  }
  return { allowed: false, reason: blockReason };
}

/**
 * Determines whether a shell invocation should be auto-approved based on an allowlist.
 *
 * This reuses the same parsing logic as command-permission enforcement so that
 * chained commands must be individually covered by the allowlist.
 *
 * @param invocation The shell tool invocation being evaluated.
 * @param allowedPatterns The configured allowlist patterns (e.g. `run_shell_command(git)`).
 * @returns True if every parsed command segment is allowed by the patterns; false otherwise.
 */
export function isShellInvocationAllowlisted(
  invocation: AnyToolInvocation,
  allowedPatterns: string[],
): boolean {
  if (!allowedPatterns.length) {
    return false;
  }

  const hasShellWildcard = allowedPatterns.some((pattern) =>
    SHELL_TOOL_NAMES.includes(pattern),
  );
  const hasShellSpecificPattern = allowedPatterns.some((pattern) =>
    SHELL_TOOL_NAMES.some((name) => pattern.startsWith(`${name}(`)),
  );

  if (!hasShellWildcard && !hasShellSpecificPattern) {
    return false;
  }

  if (hasShellWildcard) {
    return true;
  }

  if (
    !('params' in invocation) ||
    typeof invocation.params !== 'object' ||
    invocation.params === null ||
    !('command' in invocation.params)
  ) {
    return false;
  }

  const commandValue = (invocation.params as { command?: unknown }).command;
  if (typeof commandValue !== 'string' || !commandValue.trim()) {
    return false;
  }

  const command = commandValue.trim();

  const parseResult = parseCommandDetails(command);
  if (!parseResult || parseResult.hasError) {
    return false;
  }

  const normalize = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ');
  const commandsToValidate = parseResult.details
    .map((detail) => normalize(detail.text))
    .filter(Boolean);

  if (commandsToValidate.length === 0) {
    return false;
  }

  return commandsToValidate.every((commandSegment) =>
    doesToolInvocationMatch(
      SHELL_TOOL_NAMES[0],
      { params: { command: commandSegment } } as AnyToolInvocation,
      allowedPatterns,
    ),
  );
}
