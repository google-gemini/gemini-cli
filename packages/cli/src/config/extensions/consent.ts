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

export const INSTALL_WARNING_MESSAGE = chalk.yellow(
  'The extension you are about to install may have been created by a third-party developer and sourced from a public repository. Google does not vet, endorse, or guarantee the functionality or security of extensions. Please carefully inspect any extension and its source code before installing to understand the permissions it requires and the actions it may perform.',
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
  debugLogger.log(consentDescription);
  const result = await promptForConsentNonInteractive(
    'Do you want to continue? [Y/n]: ',
  );
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
  defaultValue = true,
): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const trimmedAnswer = answer.trim().toLowerCase();
      if (trimmedAnswer === '') {
        resolve(defaultValue);
      } else {
        resolve(['y', 'yes'].includes(trimmedAnswer));
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
): Promise<string> {
  const sanitizedConfig = escapeAnsiCtrlCodes(extensionConfig);
  const output: string[] = [];
  const mcpServerEntries = Object.entries(sanitizedConfig.mcpServers || {});

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
  } else {
    output.push(`Installing extension "${sanitizedConfig.name}".`);
  }

  if (mcpServerEntries.length) {
    output.push('This extension will run the following MCP servers:');
    for (const [key, mcpServer] of mcpServerEntries) {
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
          const isSensitive =
            /token|secret|password|passwd|key|auth|credential|creds|private|cert/i.test(
              envKey,
            );
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
          const isSensitive = /authorization|key|cookie|token|secret/i.test(
            headerKey,
          );
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
          const isSensitive = /secret|token|password/i.test(oKey);
          const valStr = Array.isArray(oValue)
            ? oValue.join(', ')
            : String(oValue ?? '');
          const displayValue = isSensitive && valStr ? '********' : valStr;
          output.push(`      - ${oKey}: ${displayValue}`);
        }
      }
      output.push(`    Config signature: ${getMcpServerConfigHash(mcpServer)}`);
    }
  }
  if (sanitizedConfig.contextFileName) {
    output.push(
      `This extension will append info to your gemini.md context using ${sanitizedConfig.contextFileName}`,
    );
  }
  if (sanitizedConfig.excludeTools) {
    output.push(
      `This extension will exclude the following core tools: ${sanitizedConfig.excludeTools}`,
    );
  }
  if (hasHooks) {
    output.push(
      '⚠️  This extension contains Hooks which can automatically execute commands.',
    );
  }
  if (skills.length > 0) {
    output.push(`\n${chalk.bold('Agent Skills:')}`);
    output.push('\nThis extension will install the following agent skills:\n');
    output.push(...(await renderSkillsList(skills)));
  }

  output.push('\n' + INSTALL_WARNING_MESSAGE);
  if (skills.length > 0) {
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
) {
  const extensionConsent = await extensionConsentString(
    extensionConfig,
    hasHooks,
    skills,
    previousExtensionConfig?.name,
    isMigrating,
  );
  if (previousExtensionConfig) {
    const previousExtensionConsent = await extensionConsentString(
      previousExtensionConfig,
      previousHasHooks ?? false,
      previousSkills,
    );
    if (previousExtensionConsent === extensionConsent) {
      return;
    }
  }
  if (!(await requestConsent(extensionConsent))) {
    throw new Error(`Installation cancelled for "${extensionConfig.name}".`);
  }
}
