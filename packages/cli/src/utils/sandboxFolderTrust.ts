/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import { Writable } from 'node:stream';
import stripAnsi from 'strip-ansi';
import {
  FatalCancellationError,
  FatalConfigError,
  FolderTrustDiscoveryService,
  writeToStdout,
  type FolderDiscoveryResults,
  type SandboxConfig,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import {
  isFolderTrustEnabled,
  isWorkspaceTrusted,
  loadTrustedFolders,
  TrustLevel,
} from '../config/trustedFolders.js';

const TRUST_WORKSPACE_ENV = 'GEMINI_CLI_TRUST_WORKSPACE';

/** Maps an answer to the terminal prompt to a trust level. */
function parseTrustChoice(answer: string): TrustLevel | undefined {
  switch (answer.trim()) {
    case '1':
      return TrustLevel.TRUST_FOLDER;
    case '2':
      return TrustLevel.TRUST_PARENT;
    case '3':
      return TrustLevel.DO_NOT_TRUST;
    default:
      return undefined;
  }
}

export interface ResolveFolderTrustForSandboxOptions {
  /** The command of the sandbox about to be started, e.g. `sandbox-exec`. */
  sandboxCommand: SandboxConfig['command'];
  settings: LoadedSettings;
  /** Whether the user can be prompted on the terminal. */
  interactive: boolean;
  workspaceDir?: string;
  /** Asks the user for a trust level. Resolves `undefined` if cancelled. */
  promptForTrustLevel?: (
    workspaceDir: string,
  ) => Promise<TrustLevel | undefined>;
}

/**
 * Resolves folder trust before relaunching into the macOS Seatbelt sandbox and
 * passes the decision to the sandboxed process through
 * `GEMINI_CLI_TRUST_WORKSPACE`.
 *
 * The Seatbelt profiles deny the sandboxed process access to
 * `~/.gemini/trustedFolders.json`, so inside the sandbox the folder trust
 * dialog can neither read existing trust decisions nor save new ones. This
 * runs in the parent process, which is not sandboxed: it reads the existing
 * decision, or prompts once if the folder has none, and saves it before the
 * sandbox starts.
 */
export async function resolveFolderTrustForSandbox({
  sandboxCommand,
  settings,
  interactive,
  workspaceDir = process.cwd(),
  promptForTrustLevel = promptForFolderTrustLevel,
}: ResolveFolderTrustForSandboxOptions): Promise<void> {
  if (sandboxCommand !== 'sandbox-exec') {
    return;
  }
  if (!isFolderTrustEnabled(settings.merged)) {
    return;
  }

  const trust = isWorkspaceTrusted(settings.merged, workspaceDir);
  if (trust.source === 'env') {
    // Decisions made through environment variables (e.g. `--skip-trust`) are
    // already inherited by the sandboxed process.
    return;
  }

  let isTrusted = trust.isTrusted;
  if (isTrusted === undefined) {
    if (!interactive) {
      // Nobody to ask; keep the existing non-interactive behavior.
      return;
    }
    const trustLevel = await promptForTrustLevel(workspaceDir);
    if (trustLevel === undefined) {
      throw new FatalCancellationError(
        'A folder trust level must be selected to continue.',
      );
    }
    try {
      await loadTrustedFolders().setValue(workspaceDir, trustLevel);
    } catch {
      throw new FatalConfigError('Failed to save trust settings.');
    }
    isTrusted = trustLevel !== TrustLevel.DO_NOT_TRUST;
  }

  process.env[TRUST_WORKSPACE_ENV] = isTrusted ? 'true' : 'false';
}

/**
 * Builds the text of the terminal folder trust prompt. It mirrors the in-app
 * folder trust dialog, which is not available before the sandbox starts.
 */
export function formatFolderTrustPrompt(
  workspaceDir: string,
  discoveryResults?: FolderDiscoveryResults,
): string {
  const folderName =
    stripAnsi(path.basename(workspaceDir)).trim() || stripAnsi(workspaceDir);
  const parentDir = path.dirname(workspaceDir);
  const parentFolderName =
    stripAnsi(path.basename(parentDir)).trim() || stripAnsi(parentDir);

  const lines = [
    '',
    'Do you trust the files in this folder?',
    '',
    'Trusting a folder allows Gemini CLI to load its local configurations, including custom commands, hooks, MCP servers, agent skills, and settings. These configurations could execute code on your behalf or change the behavior of the CLI.',
    '',
  ];

  const appendSection = (title: string, items: string[]) => {
    if (items.length === 0) {
      return;
    }
    lines.push(title);
    for (const item of items) {
      lines.push(`  • ${stripAnsi(item)}`);
    }
    lines.push('');
  };

  if (discoveryResults) {
    appendSection('Discovery Errors:', discoveryResults.discoveryErrors ?? []);
    appendSection(
      'Security Warnings:',
      discoveryResults.securityWarnings ?? [],
    );

    const groups: Array<[string, string[]]> = [
      ['Commands', discoveryResults.commands ?? []],
      ['MCP Servers', discoveryResults.mcps ?? []],
      ['Hooks', discoveryResults.hooks ?? []],
      ['Skills', discoveryResults.skills ?? []],
      ['Agents', discoveryResults.agents ?? []],
      ['Setting overrides', discoveryResults.settings ?? []],
    ];
    const nonEmptyGroups = groups.filter(([, items]) => items.length > 0);
    if (nonEmptyGroups.length > 0) {
      lines.push('This folder contains:');
      for (const [label, items] of nonEmptyGroups) {
        lines.push(`  • ${label} (${items.length}):`);
        for (const item of items) {
          lines.push(`    - ${stripAnsi(item)}`);
        }
      }
      lines.push('');
    }
  }

  lines.push(
    `  1. Trust folder (${folderName})`,
    `  2. Trust parent folder (${parentFolderName})`,
    "  3. Don't trust",
    '',
    'This choice is saved before Gemini CLI starts in the macOS Seatbelt sandbox.',
    '',
  );
  return lines.join('\n');
}

/**
 * Returns a stream that writes to the terminal. During startup,
 * `process.stdout` is patched to buffer output for the UI, which has not
 * started yet when this prompt is shown.
 */
function createTerminalOutput(): Writable {
  return new Writable({
    decodeStrings: false,
    write(chunk: string | Uint8Array, _encoding, callback) {
      writeToStdout(chunk);
      callback();
    },
  });
}

/**
 * Asks the user on the terminal whether to trust the workspace folder.
 *
 * @returns The selected trust level, or `undefined` if the input ended without
 *     an answer (for example, Ctrl+D). Ctrl+C exits through the CLI's regular
 *     signal handling.
 */
export async function promptForFolderTrustLevel(
  workspaceDir: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = createTerminalOutput(),
): Promise<TrustLevel | undefined> {
  let discoveryResults: FolderDiscoveryResults | undefined;
  try {
    discoveryResults = await FolderTrustDiscoveryService.discover(workspaceDir);
  } catch {
    // Discovery only adds context to the prompt; the user can still choose.
  }

  output.write(formatFolderTrustPrompt(workspaceDir, discoveryResults));

  return new Promise((resolve) => {
    // Line mode: the terminal echoes and edits the input line.
    const rl = readline.createInterface({ input, output, terminal: false });
    let settled = false;
    const finish = (trustLevel: TrustLevel | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      rl.close();
      resolve(trustLevel);
    };

    rl.on('line', (line) => {
      const trustLevel = parseTrustChoice(line);
      if (trustLevel) {
        finish(trustLevel);
        return;
      }
      output.write('Enter 1, 2, or 3.\n');
      rl.prompt();
    });
    rl.on('close', () => finish(undefined));

    rl.setPrompt('Select an option [1-3]: ');
    rl.prompt();
  });
}
