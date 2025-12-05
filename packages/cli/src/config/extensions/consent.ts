/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';

import type { ConfirmationRequest } from '../../ui/types.js';
import { escapeAnsiCtrlCodes } from '../../ui/utils/textUtils.js';
import type { ExtensionConfig } from '../extension.js';

export const INSTALL_WARNING_MESSAGE =
  '**The extension you are about to install may have been created by a third-party developer and sourced from a public repository. Google does not vet, endorse, or guarantee the functionality or security of extensions. Please carefully inspect any extension and its source code before installing to understand the permissions it requires and the actions it may perform.**';

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
 * @param setExtensionUpdateConfirmationRequest A function to actually add a prompt to the UI.
 * @returns boolean, whether they consented or not.
 */
export async function requestConsentInteractive(
  consentDescription: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
): Promise<boolean> {
  return promptForConsentInteractive(
    consentDescription + '\n\nDo you want to continue?',
    addExtensionUpdateConfirmationRequest,
  );
}

/**
 * Asks users a prompt and awaits for a y/n response on stdin.
 *
 * This should not be called from interactive mode as it will break the CLI.
 *
 * @param prompt A yes/no prompt to ask the user
 * @returns Whether or not the user answers 'y' (yes). Defaults to 'yes' on enter.
 */
async function promptForConsentNonInteractive(
  prompt: string,
): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(['y', ''].includes(answer.trim().toLowerCase()));
    });
  });
}

/**
 * Asks users an interactive yes/no prompt.
 *
 * This should not be called from non-interactive mode as it will break the CLI.
 *
 * @param prompt A markdown prompt to ask the user
 * @param setExtensionUpdateConfirmationRequest Function to update the UI state with the confirmation request.
 * @returns Whether or not the user answers yes.
 */
async function promptForConsentInteractive(
  prompt: string,
  addExtensionUpdateConfirmationRequest: (value: ConfirmationRequest) => void,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    addExtensionUpdateConfirmationRequest({
      prompt,
      onConfirm: (resolvedConfirmed) => {
        resolve(resolvedConfirmed);
      },
    });
  });
}

/**
 * Builds a consent string for installing an extension based on it's
 * extensionConfig.
 */
function extensionConsentString(
  extensionConfig: ExtensionConfig,
  hasHooks: boolean,
): string {
  const sanitizedConfig = escapeAnsiCtrlCodes(extensionConfig);
  const output: string[] = [];
  const mcpServerEntries = Object.entries(sanitizedConfig.mcpServers || {});
  output.push(`Installing extension "${sanitizedConfig.name}".`);
  output.push(INSTALL_WARNING_MESSAGE);

  if (mcpServerEntries.length) {
    output.push('This extension will run the following MCP servers:');
    for (const [key, mcpServer] of mcpServerEntries) {
      const isLocal = !!mcpServer.command;
      const source =
        mcpServer.httpUrl ??
        `${mcpServer.command || ''}${mcpServer.args ? ' ' + mcpServer.args.join(' ') : ''}`;
      output.push(`  * ${key} (${isLocal ? 'local' : 'remote'}): ${source}`);
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
  return output.join('\n');
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
) {
  const extensionConsent = extensionConsentString(extensionConfig, hasHooks);
  if (previousExtensionConfig) {
    const previousExtensionConsent = extensionConsentString(
      previousExtensionConfig,
      previousHasHooks ?? false,
    );
    if (previousExtensionConsent === extensionConsent) {
      return;
    }
  }
  if (!(await requestConsent(extensionConsent))) {
    throw new Error(`Installation cancelled for "${extensionConfig.name}".`);
  }
}
