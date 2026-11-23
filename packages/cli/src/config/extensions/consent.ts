/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  debugLogger,
  type SkillDefinition,
  type MCPServerConfig,
} from '@google/gemini-cli-core';
import chalk from 'chalk';

import type { ConfirmationRequest } from '../../ui/types.js';
import { escapeAnsiCtrlCodes } from '../../ui/utils/textUtils.js';
import type { ExtensionConfig } from '../extension.js';
import {
  asContentMarker,
  compareCodeUnits,
  ContentMarker,
  escapeForDisplay,
  formatValueForDisplay,
  type ContentEntry,
} from './contentSignature.js';
import type {
  AgentsSummary,
  ContextFilesSummary,
  ExtensionContentSummary,
  FilesSummary,
  HookSummary,
  HooksSummary,
  McpServerSummary,
  ReferencedPath,
  SkillsSummary,
} from './extensionContentSummary.js';
import { ExtensionConsentDeclinedError } from './extensionConsentErrors.js';

export const INSTALL_WARNING_MESSAGE = chalk.yellow(
  'The extension you are about to install may have been created by a third-party developer and sourced from a public repository. Google does not vet, endorse, or guarantee the functionality or security of extensions. Please carefully inspect any extension and its source code before installing to understand the permissions it requires and the actions it may perform.',
);

export const LINK_WARNING_MESSAGE = chalk.yellow(
  '⚠️  Warning: Linking creates a live symbolic link to the target directory. Any future changes made to code, MCP servers, hooks, or prompts inside that directory will take effect automatically upon CLI startup without further warnings.',
);

export const SKILLS_WARNING_MESSAGE = chalk.yellow(
  "Agent skills inject specialized instructions and domain-specific knowledge into the agent's system prompt. This can change how the agent interprets your requests and interacts with your environment. Review the skill definitions at the location(s) provided below to ensure they meet your security standards.",
);

/**
 * Builds a consent string for installing agent skills.
 */
export async function skillsConsentString(
  skills: SkillDefinition[],
  source: string,
  targetDir?: string,
  isLink = false,
): Promise<string> {
  const action = isLink ? 'Linking' : 'Installing';
  const output: string[] = [];
  output.push(`${action} agent skill(s) from "${source}".`);
  output.push(
    `\nThe following agent skill(s) will be ${action.toLowerCase()}:\n`,
  );
  output.push(...(await renderSkillsList(skills)));

  if (targetDir) {
    const destLabel = isLink ? 'Link' : 'Install';
    output.push(`${destLabel} Destination: ${targetDir}`);
  }
  output.push('\n' + SKILLS_WARNING_MESSAGE);

  return output.join('\n');
}

/**
 * Non-interactive prompts share stdin, so they run one at a time: each one
 * prints its description only after the previous one has its answer.
 */
let nonInteractiveConsentQueue: Promise<unknown> = Promise.resolve();

/**
 * Requests consent from the user to perform an action, by reading a Y/n
 * character from stdin.
 *
 * This should not be called from interactive mode as it will break the CLI.
 *
 * @param consentDescription The description of the thing they will be consenting to.
 * @returns boolean, whether they consented or not.
 */
export async function requestConsentNonInteractive(
  consentDescription: string,
): Promise<boolean> {
  const ask = async () => {
    debugLogger.log(consentDescription);
    return promptForConsentNonInteractive(
      'Do you want to continue? [y/N]: ',
      false,
    );
  };
  const result = nonInteractiveConsentQueue.then(ask);
  nonInteractiveConsentQueue = result.catch(() => undefined);
  return result;
}

/**
 * Requests consent from the user to perform an action, in interactive mode.
 *
 * This should not be called from non-interactive mode as it will not work.
 *
 * @param consentDescription The description of the thing they will be consenting to.
 * @param addExtensionUpdateConfirmationRequest A function to actually add a prompt to the UI.
 * @returns boolean, whether they consented or not.
 */
export async function requestConsentInteractive(
  consentDescription: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
  clearConfirmationRequest?: () => void,
): Promise<boolean> {
  return promptForConsentInteractive(
    consentDescription + '\n\nDo you want to continue?',
    addExtensionUpdateConfirmationRequest,
    clearConfirmationRequest,
  );
}

/**
 * Asks users a prompt and awaits for a y/n response on stdin.
 *
 * This should not be called from interactive mode as it will break the CLI.
 *
 * @param prompt A yes/no prompt to ask the user
 * @param defaultValue Whether to resolve as true or false on enter.
 * @returns Whether or not the user answers 'y' (yes).
 */
export async function promptForConsentNonInteractive(
  prompt: string,
  defaultValue = false,
): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      rl.close();
      resolve(value);
    };

    rl.on?.('close', () => {
      finish(false);
    });

    rl.question(prompt, (answer) => {
      const trimmedAnswer = answer.trim().toLowerCase();
      if (trimmedAnswer === '') {
        finish(defaultValue);
      } else {
        finish(['y', 'yes'].includes(trimmedAnswer));
      }
    });
  });
}

/**
 * Asks users an interactive yes/no prompt.
 *
 * This should not be called from non-interactive mode as it will break the CLI.
 *
 * @param prompt A markdown prompt to ask the user
 * @param addExtensionUpdateConfirmationRequest Function to update the UI state with the confirmation request.
 * @returns Whether or not the user answers yes.
 */
async function promptForConsentInteractive(
  prompt: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
  clearConfirmationRequest?: () => void,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    addExtensionUpdateConfirmationRequest({
      prompt,
      onConfirm: (resolvedConfirmed) => {
        clearConfirmationRequest?.();
        setImmediate(() => resolve(resolvedConfirmed));
      },
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Helper to generate a deterministic canonical hash of an MCPServerConfig object.
 * Excludes circular or complex fields like extension.
 */
function getMcpServerConfigHash(mcpServer: MCPServerConfig): string {
  const plainMcpServer: Record<string, unknown> = isRecord(mcpServer)
    ? mcpServer
    : {};
  const copy = { ...plainMcpServer };
  delete copy['extension'];

  const canonicalString = JSON.stringify(copy, (key, value) => {
    if (value instanceof RegExp) {
      return value.toString();
    }
    if (isRecord(value)) {
      return Object.keys(value)
        .sort()
        .reduce((result: Record<string, unknown>, k) => {
          result[k] = value[k];
          return result;
        }, {});
    }
    return value as unknown;
  });

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/** Environment variable names whose values the consent text masks. */
const SENSITIVE_ENV_NAME =
  /token|secret|password|passwd|key|auth|credential|creds|private|cert/i;

/** Header names whose values the consent text masks. */
const SENSITIVE_HEADER_NAME = /authorization|key|cookie|token|secret/i;

/** OAuth setting names whose values the consent text masks. */
const SENSITIVE_OAUTH_NAME = /secret|token|password/i;

const HOOKS_HEADING =
  '⚠️  This extension contains Hooks which can automatically execute commands';

const CHANGES_HEADING = 'Changes since the installed version:';

function formatEnvValue(name: string, value: string): string {
  return SENSITIVE_ENV_NAME.test(name) && value
    ? '********'
    : formatValueForDisplay(value);
}

function formatPathNote(
  label: string,
  marker: ContentMarker | undefined,
): string {
  switch (marker) {
    case undefined:
    case ContentMarker.Directory:
      return label;
    case ContentMarker.Root:
      return `${label} (the extension folder)`;
    case ContentMarker.Outside:
      return `${label} (outside the extension folder)`;
    case ContentMarker.Missing:
      return `${label} (not found)`;
    case ContentMarker.Dangling:
      return `${label} (broken link)`;
    case ContentMarker.Unsupported:
      return `${label} (not a regular file)`;
    default:
      return `${label} (unreadable)`;
  }
}

function formatReferencedPath(reference: ReferencedPath): string {
  return formatPathNote(
    formatValueForDisplay(reference.path),
    reference.marker,
  );
}

function formatEntryPath(entry: ContentEntry): string {
  return formatPathNote(
    formatValueForDisplay(entry.path),
    asContentMarker(entry.value),
  );
}

function formatHook(hook: HookSummary): string {
  const details: string[] = [];
  if (hook.matcher !== undefined) {
    details.push(`matcher: ${formatValueForDisplay(hook.matcher)}`);
  }
  if (hook.name !== undefined) {
    details.push(`name: ${formatValueForDisplay(hook.name)}`);
  }
  const qualifier = details.length > 0 ? ` (${details.join(', ')})` : '';
  const action =
    hook.command !== undefined
      ? formatValueForDisplay(hook.command)
      : `no command, type ${formatValueForDisplay(hook.type ?? '')}`;
  return `${escapeForDisplay(hook.eventName)}${qualifier}: ${action}`;
}

function renderHooksSection(summary: HooksSummary): string[] {
  const output = [`${HOOKS_HEADING}:`];
  if (!summary.hooks) {
    output.push(
      `  * ${formatValueForDisplay('hooks/hooks.json')} isn't a valid hooks file, so its hooks can't be listed.`,
    );
  }
  for (const hook of summary.hooks ?? []) {
    output.push(`  * ${formatHook(hook)}`);
    if (hook.env.length > 0) {
      output.push('      Environment variables:');
      for (const [name, value] of hook.env) {
        output.push(
          `        - ${escapeForDisplay(name)}: ${formatEnvValue(name, value)}`,
        );
      }
    }
  }
  if (summary.referencedPaths.length > 0) {
    output.push(
      `  Files used by hooks: ${summary.referencedPaths.map(formatReferencedPath).join(', ')}`,
    );
  }
  output.push(`  Hooks signature: ${summary.signature}`);
  return output;
}

function renderContextFilesDetails(summary: ContextFilesSummary): string[] {
  const output: string[] = [];
  if (summary.importedPaths.length > 0) {
    output.push(
      `  Imported files: ${summary.importedPaths.map((importedPath) => formatValueForDisplay(importedPath)).join(', ')}`,
    );
  }
  output.push(`  Context files signature: ${summary.signature}`);
  return output;
}

function sortedEntries<T>(
  record: Record<string, T> | undefined,
): Array<[string, T]> {
  return Object.entries(record ?? {}).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  );
}

/**
 * Lists the MCP server of a sub-agent like a manifest MCP server, with values
 * as written, escaped, and in code spans.
 */
function renderAgentMcpServer(name: string, server: MCPServerConfig): string[] {
  const indent = '      ';
  const isLocal = !!server.command;
  const source =
    server.httpUrl ??
    `${server.command || ''}${server.args ? ' ' + server.args.join(' ') : ''}`;
  const output = [
    `${indent}MCP server ${formatValueForDisplay(name)} (${isLocal ? 'local' : 'remote'}): ${formatValueForDisplay(source)}`,
  ];
  if (server.cwd) {
    output.push(
      `${indent}Working directory: ${formatValueForDisplay(server.cwd)}`,
    );
  }
  const env = sortedEntries(server.env);
  if (env.length > 0) {
    output.push(`${indent}Environment variables:`);
    for (const [envName, value] of env) {
      output.push(
        `${indent}  - ${escapeForDisplay(envName)}: ${formatEnvValue(envName, value ?? '')}`,
      );
    }
  }
  const headers = sortedEntries(server.headers);
  if (headers.length > 0) {
    output.push(`${indent}Headers:`);
    for (const [headerName, value] of headers) {
      const displayValue =
        SENSITIVE_HEADER_NAME.test(headerName) && value
          ? '********'
          : formatValueForDisplay(value ?? '');
      output.push(
        `${indent}  - ${escapeForDisplay(headerName)}: ${displayValue}`,
      );
    }
  }
  if (server.url) {
    output.push(`${indent}URL: ${formatValueForDisplay(server.url)}`);
  }
  if (server.tcp) {
    output.push(`${indent}TCP: ${formatValueForDisplay(server.tcp)}`);
  }
  if (server.type) {
    output.push(`${indent}Type: ${formatValueForDisplay(server.type)}`);
  }
  if (server.timeout !== undefined) {
    output.push(`${indent}Timeout: ${server.timeout}`);
  }
  if (server.trust !== undefined) {
    output.push(`${indent}Trust: ${server.trust}`);
  }
  if (server.description) {
    output.push(
      `${indent}Description: ${formatValueForDisplay(server.description)}`,
    );
  }
  for (const [label, tools] of [
    ['Include tools', server.includeTools],
    ['Exclude tools', server.excludeTools],
  ] as const) {
    if (tools && tools.length > 0) {
      output.push(
        `${indent}${label}: ${tools.map((tool) => formatValueForDisplay(tool)).join(', ')}`,
      );
    }
  }
  if (server.authProviderType) {
    output.push(
      `${indent}Auth Provider Type: ${formatValueForDisplay(server.authProviderType)}`,
    );
  }
  if (server.oauth) {
    output.push(`${indent}OAuth Configuration:`);
    for (const [key, value] of sortedEntries<unknown>({ ...server.oauth })) {
      const text = Array.isArray(value)
        ? value.join(', ')
        : String(value ?? '');
      const displayValue =
        SENSITIVE_OAUTH_NAME.test(key) && text
          ? '********'
          : formatValueForDisplay(text);
      output.push(`${indent}  - ${escapeForDisplay(key)}: ${displayValue}`);
    }
  }
  return output;
}

function renderAgentsSection(summary: AgentsSummary): string[] {
  const output = ['This extension will add the following sub-agents:'];
  for (const agent of summary.agents) {
    if (agent.name === undefined) {
      output.push(
        `  * ${formatValueForDisplay(agent.path)} isn't a valid sub-agent file.`,
      );
      continue;
    }
    output.push(
      `  * ${formatValueForDisplay(agent.name)} (${formatValueForDisplay(agent.path)})`,
    );
    if (agent.agentCardUrl !== undefined) {
      output.push(
        `      Agent card URL: ${formatValueForDisplay(agent.agentCardUrl)}`,
      );
    }
    for (const [name, server] of agent.mcpServers) {
      output.push(...renderAgentMcpServer(name, server));
    }
  }
  for (const entry of summary.files) {
    // The agents folder itself, when it's a link that can't be followed.
    if (entry.path === 'agents' && entry.value !== ContentMarker.Directory) {
      output.push(`  * ${formatEntryPath(entry)}`);
    }
  }
  if (summary.referencedPaths.length > 0) {
    output.push(
      `  Files used by MCP servers: ${summary.referencedPaths.map(formatReferencedPath).join(', ')}`,
    );
  }
  output.push(`  Agents signature: ${summary.signature}`);
  return output;
}

function renderFilesSection(
  heading: string,
  signatureLabel: string,
  summary: FilesSummary,
): string[] {
  return [
    heading,
    ...summary.files
      .filter((entry) => entry.value !== ContentMarker.Directory)
      .map((entry) => `  * ${formatEntryPath(entry)}`),
    `  ${signatureLabel}: ${summary.signature}`,
  ];
}

/**
 * Lists skills like `renderSkillsList`, with paths relative to the extension
 * folder, escaped values, and a signature line.
 */
function renderSkillSummaries(summary: SkillsSummary): string[] {
  const output: string[] = [];
  for (const skill of summary.skills) {
    output.push(
      `  * ${chalk.bold(escapeForDisplay(skill.name))}: ${escapeForDisplay(skill.description)}`,
    );
    const fileCountStr =
      skill.itemCount !== undefined
        ? ` (${skill.itemCount} items in directory)`
        : ` ${chalk.red('⚠️ (Could not count items in directory)')}`;
    output.push(
      chalk.dim(
        `    (Source: ${escapeForDisplay(skill.location)})${fileCountStr}`,
      ),
    );
    output.push('');
  }
  output.push(`  Skills signature: ${summary.signature}`);
  return output;
}

/** Hashes per skill folder, plus files under `skills/` outside any skill. */
function skillHashes(summary: SkillsSummary | undefined): Map<string, string> {
  const hashes = new Map<string, string>();
  const folders: string[] = [];
  for (const skill of summary?.skills ?? []) {
    const folder = path.posix.dirname(skill.location);
    folders.push(folder);
    hashes.set(folder, skill.signature);
  }
  for (const entry of summary?.files ?? []) {
    const inSkillFolder = folders.some(
      (folder) => entry.path === folder || entry.path.startsWith(`${folder}/`),
    );
    if (!inSkillFolder) {
      hashes.set(entry.path, `${entry.type}\0${entry.value}`);
    }
  }
  return hashes;
}

/** Lists the items that were added, changed, or removed, keyed by label. */
function describeItemChanges(
  section: string,
  previous: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  const labels = [...new Set([...previous.keys(), ...current.keys()])].sort(
    compareCodeUnits,
  );
  const lines: string[] = [];
  for (const label of labels) {
    const before = previous.get(label);
    const after = current.get(label);
    if (before === after) {
      continue;
    }
    let change = 'changed';
    if (before === undefined) {
      change = 'added';
    } else if (after === undefined) {
      change = 'removed';
    }
    lines.push(`  * ${section}: ${formatValueForDisplay(label)} ${change}`);
  }
  return lines;
}

function fileHashes(
  entries: readonly ContentEntry[],
  excludedPath?: string,
): Map<string, string> {
  return new Map(
    entries
      .filter((entry) => entry.path !== excludedPath)
      .map((entry) => [entry.path, `${entry.type}\0${entry.value}`]),
  );
}

function referenceHashes(
  references: readonly ReferencedPath[],
): Map<string, string> {
  return new Map(
    references.map((reference) => [reference.path, reference.signature]),
  );
}

function mcpServerHashes(
  servers: ReadonlyArray<[string, McpServerSummary]> | undefined,
): Map<string, string> {
  return new Map(
    (servers ?? []).map(([name, server]) => [
      name,
      getMcpServerConfigHash(escapeAnsiCtrlCodes(server.config)),
    ]),
  );
}

function mcpReferenceHashes(
  servers: ReadonlyArray<[string, McpServerSummary]> | undefined,
): Map<string, string> {
  return referenceHashes(
    (servers ?? []).flatMap(([, server]) => server.referencedPaths),
  );
}

function hookKey(hook: HookSummary): string {
  return JSON.stringify([
    hook.eventName,
    hook.matcher,
    hook.name,
    hook.command,
    hook.type,
    hook.env,
  ]);
}

function hookLabel(hook: HookSummary): string {
  const matcher =
    hook.matcher !== undefined ? ` (matcher: ${hook.matcher})` : '';
  return `${hook.eventName}${matcher}: ${hook.command ?? hook.type ?? ''}`;
}

function describeHookChanges(
  previous: HooksSummary | undefined,
  current: HooksSummary | undefined,
): string[] {
  const previousHooks = new Set((previous?.hooks ?? []).map(hookKey));
  const hookLines = (current?.hooks ?? [])
    .filter((hook) => !previousHooks.has(hookKey(hook)))
    .map(
      (hook) =>
        `  * Hooks: new or changed ${formatValueForDisplay(hookLabel(hook))}`,
    );
  // When hooks changed, they already describe the change to hooks.json.
  const excludedPath = hookLines.length > 0 ? 'hooks/hooks.json' : undefined;
  return [
    ...hookLines,
    ...describeItemChanges(
      'Hooks',
      fileHashes(previous?.files ?? [], excludedPath),
      fileHashes(current?.files ?? [], excludedPath),
    ),
    ...describeItemChanges(
      'Hooks',
      referenceHashes(previous?.referencedPaths ?? []),
      referenceHashes(current?.referencedPaths ?? []),
    ),
  ];
}

/**
 * Describes what changed between the installed and the new content of an
 * extension, for the block shown above the consent question.
 */
function describeContentChanges(
  previous: ExtensionContentSummary,
  current: ExtensionContentSummary,
): string[] {
  return [
    ...new Set([
      ...describeHookChanges(previous.hooks, current.hooks),
      ...describeItemChanges(
        'Context files',
        fileHashes(previous.contextFiles?.files ?? []),
        fileHashes(current.contextFiles?.files ?? []),
      ),
      ...describeItemChanges(
        'Skills',
        skillHashes(previous.skills),
        skillHashes(current.skills),
      ),
      ...describeItemChanges(
        'Sub-agents',
        fileHashes(previous.agents?.files ?? []),
        fileHashes(current.agents?.files ?? []),
      ),
      ...describeItemChanges(
        'Sub-agents',
        referenceHashes(previous.agents?.referencedPaths ?? []),
        referenceHashes(current.agents?.referencedPaths ?? []),
      ),
      ...describeItemChanges(
        'Custom commands',
        fileHashes(previous.commands?.files ?? []),
        fileHashes(current.commands?.files ?? []),
      ),
      ...describeItemChanges(
        'Policies',
        fileHashes(previous.policies?.files ?? []),
        fileHashes(current.policies?.files ?? []),
      ),
      ...describeItemChanges(
        'MCP servers',
        mcpServerHashes(previous.mcpServers),
        mcpServerHashes(current.mcpServers),
      ),
      ...describeItemChanges(
        'MCP servers',
        mcpReferenceHashes(previous.mcpServers),
        mcpReferenceHashes(current.mcpServers),
      ),
    ]),
  ];
}

/**
 * Builds a consent string for installing an extension based on it's
 * extensionConfig.
 */
async function extensionConsentString(
  extensionConfig: ExtensionConfig,
  hasHooks: boolean,
  skills: SkillDefinition[] = [],
  previousName?: string,
  wasMigrated?: boolean,
  linkedSourcePath?: string,
  contentSummary?: ExtensionContentSummary,
): Promise<string> {
  const sanitizedConfig = escapeAnsiCtrlCodes(extensionConfig);
  const sanitizedLinkedPath = linkedSourcePath
    ? escapeAnsiCtrlCodes(linkedSourcePath)
    : undefined;
  const output: string[] = [];
  const mcpServerEntries = Object.entries(sanitizedConfig.mcpServers || {});
  // With a summary, MCP servers show their values as written in the manifest.
  const rawMcpServers = contentSummary?.mcpServers;
  const mcpServers = rawMcpServers
    ? rawMcpServers.map(([name, server]): [string, MCPServerConfig] => [
        name,
        escapeAnsiCtrlCodes(server.config),
      ])
    : mcpServerEntries;
  const mcpServerFiles = new Map(rawMcpServers ?? []);

  if (wasMigrated) {
    if (previousName && previousName !== sanitizedConfig.name) {
      output.push(
        `Migrating extension "${previousName}" to a new repository, renaming to "${sanitizedConfig.name}", and installing updates.`,
      );
    } else {
      output.push(
        `Migrating extension "${sanitizedConfig.name}" to a new repository and installing updates.`,
      );
    }
  } else if (previousName && previousName !== sanitizedConfig.name) {
    output.push(
      `Renaming extension "${previousName}" to "${sanitizedConfig.name}" and installing updates.`,
    );
  } else if (sanitizedLinkedPath) {
    output.push(
      `Linking extension "${sanitizedConfig.name}" from canonical path "${sanitizedLinkedPath}".`,
    );
  } else {
    output.push(`Installing extension "${sanitizedConfig.name}".`);
  }

  if (mcpServers.length) {
    output.push('This extension will run the following MCP servers:');
    for (const [key, mcpServer] of mcpServers) {
      const isLocal = !!mcpServer.command;
      const source =
        mcpServer.httpUrl ??
        `${mcpServer.command || ''}${mcpServer.args ? ' ' + mcpServer.args.join(' ') : ''}`;
      output.push(`  * ${key} (${isLocal ? 'local' : 'remote'}): ${source}`);
      if (mcpServer.cwd) {
        output.push(`    Working directory: ${mcpServer.cwd}`);
      }
      if (mcpServer.env && Object.keys(mcpServer.env).length > 0) {
        output.push('    Environment variables:');
        const sortedEnv = Object.entries(mcpServer.env).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        for (const [envKey, envValue] of sortedEnv) {
          const isSensitive = SENSITIVE_ENV_NAME.test(envKey);
          const displayValue =
            isSensitive && envValue ? '********' : (envValue ?? '');
          output.push(`      - ${envKey}: ${displayValue}`);
        }
      }
      if (mcpServer.headers && Object.keys(mcpServer.headers).length > 0) {
        output.push('    Headers:');
        const sortedHeaders = Object.entries(mcpServer.headers).sort(
          ([a], [b]) => a.localeCompare(b),
        );
        for (const [headerKey, headerValue] of sortedHeaders) {
          const isSensitive = SENSITIVE_HEADER_NAME.test(headerKey);
          const displayValue =
            isSensitive && headerValue ? '********' : (headerValue ?? '');
          output.push(`      - ${headerKey}: ${displayValue}`);
        }
      }
      if (mcpServer.url) {
        output.push(`    URL: ${mcpServer.url}`);
      }
      if (mcpServer.tcp) {
        output.push(`    TCP: ${mcpServer.tcp}`);
      }
      if (mcpServer.type) {
        output.push(`    Type: ${mcpServer.type}`);
      }
      if (mcpServer.timeout !== undefined) {
        output.push(`    Timeout: ${mcpServer.timeout}`);
      }
      if (mcpServer.trust !== undefined) {
        output.push(`    Trust: ${mcpServer.trust}`);
      }
      if (mcpServer.description) {
        output.push(`    Description: ${mcpServer.description}`);
      }
      if (mcpServer.includeTools && mcpServer.includeTools.length > 0) {
        output.push(`    Include tools: ${mcpServer.includeTools.join(', ')}`);
      }
      if (mcpServer.excludeTools && mcpServer.excludeTools.length > 0) {
        output.push(`    Exclude tools: ${mcpServer.excludeTools.join(', ')}`);
      }
      if (mcpServer.authProviderType) {
        output.push(`    Auth Provider Type: ${mcpServer.authProviderType}`);
      }
      if (mcpServer.targetAudience) {
        output.push(`    Target Audience: ${mcpServer.targetAudience}`);
      }
      if (mcpServer.targetServiceAccount) {
        output.push(
          `    Target Service Account: ${mcpServer.targetServiceAccount}`,
        );
      }
      if (mcpServer.oauth) {
        output.push('    OAuth Configuration:');
        const sortedOauth = Object.entries(mcpServer.oauth).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        for (const [oKey, oValue] of sortedOauth) {
          const isSensitive = SENSITIVE_OAUTH_NAME.test(oKey);
          const valStr = Array.isArray(oValue)
            ? oValue.join(', ')
            : String(oValue ?? '');
          const displayValue = isSensitive && valStr ? '********' : valStr;
          output.push(`      - ${oKey}: ${displayValue}`);
        }
      }
      output.push(`    Config signature: ${getMcpServerConfigHash(mcpServer)}`);
      const serverFiles = mcpServerFiles.get(key);
      if (serverFiles?.filesSignature) {
        output.push(
          `    Files used: ${serverFiles.referencedPaths.map(formatReferencedPath).join(', ')}`,
        );
        output.push(`    Files signature: ${serverFiles.filesSignature}`);
      }
    }
  }
  if (sanitizedConfig.contextFileName) {
    output.push(
      `This extension will append info to your gemini.md context using ${sanitizedConfig.contextFileName}`,
    );
  } else if (contentSummary?.contextFiles) {
    output.push(
      'This extension will append info to your gemini.md context using GEMINI.md',
    );
  }
  if (contentSummary?.contextFiles) {
    output.push(...renderContextFilesDetails(contentSummary.contextFiles));
  }
  if (sanitizedConfig.excludeTools) {
    output.push(
      `This extension will exclude the following core tools: ${sanitizedConfig.excludeTools}`,
    );
  }
  if (contentSummary) {
    if (contentSummary.hooks) {
      output.push(...renderHooksSection(contentSummary.hooks));
    }
  } else if (hasHooks) {
    output.push(`${HOOKS_HEADING}.`);
  }
  if (contentSummary?.agents) {
    output.push(...renderAgentsSection(contentSummary.agents));
  }
  if (contentSummary?.commands) {
    output.push(
      ...renderFilesSection(
        'This extension will add the following custom commands:',
        'Commands signature',
        contentSummary.commands,
      ),
    );
  }
  if (contentSummary?.policies) {
    output.push(
      ...renderFilesSection(
        'This extension will add the following policy files:',
        'Policies signature',
        contentSummary.policies,
      ),
    );
  }
  const hasSkills = contentSummary
    ? contentSummary.skills !== undefined
    : skills.length > 0;
  if (hasSkills) {
    output.push(`\n${chalk.bold('Agent Skills:')}`);
    output.push('\nThis extension will install the following agent skills:\n');
    output.push(
      ...(contentSummary?.skills
        ? renderSkillSummaries(contentSummary.skills)
        : await renderSkillsList(skills)),
    );
  }

  if (sanitizedLinkedPath) {
    output.push(
      '\n' +
        chalk.yellow(
          `⚠️  Warning: Linking creates a live symbolic link to "${sanitizedLinkedPath}". Any future changes made to code, MCP servers, hooks, or prompts inside that directory will take effect automatically upon CLI startup without further warnings.`,
        ),
    );
  }
  output.push('\n' + INSTALL_WARNING_MESSAGE);
  if (hasSkills) {
    output.push('\n' + SKILLS_WARNING_MESSAGE);
  }

  return output.join('\n');
}

/**
 * Shared logic for formatting a list of agent skills for a consent prompt.
 */
async function renderSkillsList(skills: SkillDefinition[]): Promise<string[]> {
  const output: string[] = [];
  for (const skill of skills) {
    output.push(`  * ${chalk.bold(skill.name)}: ${skill.description}`);
    const skillDir = path.dirname(skill.location);
    let fileCountStr = '';
    try {
      const skillDirItems = await fs.readdir(skillDir);
      fileCountStr = ` (${skillDirItems.length} items in directory)`;
    } catch {
      fileCountStr = ` ${chalk.red('⚠️ (Could not count items in directory)')}`;
    }
    output.push(chalk.dim(`    (Source: ${skill.location})${fileCountStr}`));
    output.push('');
  }
  return output;
}

/**
 * Requests consent from the user to install an extension (extensionConfig), if
 * there is any difference between the consent string for `extensionConfig` and
 * `previousExtensionConfig`.
 *
 * Always requests consent if previousExtensionConfig is null.
 *
 * Throws if the user does not consent.
 */
export async function maybeRequestConsentOrFail(
  extensionConfig: ExtensionConfig,
  requestConsent: (consent: string) => Promise<boolean>,
  hasHooks: boolean,
  previousExtensionConfig?: ExtensionConfig,
  previousHasHooks?: boolean,
  skills: SkillDefinition[] = [],
  previousSkills: SkillDefinition[] = [],
  isMigrating: boolean = false,
  linkedSourcePath?: string,
  previousLinkedSourcePath?: string,
  contentSummaries?: {
    current: ExtensionContentSummary;
    previous?: ExtensionContentSummary;
  },
) {
  const extensionConsent = await extensionConsentString(
    extensionConfig,
    hasHooks,
    skills,
    previousExtensionConfig?.name,
    isMigrating,
    linkedSourcePath,
    contentSummaries?.current,
  );
  let changes: string[] = [];
  if (previousExtensionConfig) {
    const previousContentSummary = contentSummaries
      ? (contentSummaries.previous ?? {})
      : undefined;
    const previousExtensionConsent = await extensionConsentString(
      previousExtensionConfig,
      previousHasHooks ?? false,
      previousSkills,
      undefined,
      false,
      previousLinkedSourcePath,
      previousContentSummary,
    );
    if (previousExtensionConsent === extensionConsent) {
      return;
    }
    if (contentSummaries && previousContentSummary) {
      changes = describeContentChanges(
        previousContentSummary,
        contentSummaries.current,
      );
    }
  }
  // The change block is shown above the question but isn't compared.
  const consentText =
    changes.length > 0
      ? [extensionConsent, '', CHANGES_HEADING, ...changes].join('\n')
      : extensionConsent;
  if (!(await requestConsent(consentText))) {
    throw new ExtensionConsentDeclinedError(extensionConfig.name);
  }
}
