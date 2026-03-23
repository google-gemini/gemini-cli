/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LspServerDefinition, LspServerUserConfig } from './types.js';
import { getLanguageFromFilePath } from '../utils/language-detection.js';

/**
 * Built-in language server definitions.
 *
 * Each entry describes how to spawn a language server for a set of language
 * IDs. The `command` and `args` assume the server binary is on PATH.
 *
 * All server-specific quirks are expressed as data fields on this definition
 * (initializationOptions, rootMarkers, useShell) — no conditional code paths.
 */
const BUILTIN_SERVERS: LspServerDefinition[] = [
  {
    id: 'typescript',
    languageIds: [
      'typescript',
      'typescriptreact',
      'javascript',
      'javascriptreact',
    ],
    command: 'typescript-language-server',
    args: ['--stdio'],
    // On Windows, npm-installed binaries are .cmd wrappers that need shell.
    useShell: process.platform === 'win32',
    rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  },
  {
    id: 'pyright',
    languageIds: ['python'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    // On Windows, Python-installed shims need shell resolution.
    useShell: process.platform === 'win32',
    rootMarkers: [
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'pyrightconfig.json',
      'requirements.txt',
    ],
  },
  {
    id: 'gopls',
    languageIds: ['go'],
    command: 'gopls',
    // gopls defaults to stdio mode — no --stdio flag needed.
    args: [],
    useShell: process.platform === 'win32',
    rootMarkers: ['go.work', 'go.mod'],
  },
  {
    id: 'rust-analyzer',
    languageIds: ['rust'],
    command: 'rust-analyzer',
    args: [],
    useShell: process.platform === 'win32',
    rootMarkers: ['Cargo.toml'],
    // rust-analyzer requires config in initializationOptions, not via
    // workspace/configuration. Tell it to use server-side file watching
    // since we don't implement full client-side glob watching.
    initializationOptions: {
      cargo: { buildScripts: { enable: true } },
      procMacro: { enable: true },
      files: { watcher: 'server' },
    },
  },
];

/**
 * Registry that resolves file paths to language server definitions.
 *
 * Supports user overrides via settings: users can override built-in server
 * commands, disable built-in servers with `enabled: false`, or add entirely
 * new servers with custom language IDs.
 */
export class LspServerRegistry {
  private readonly servers: LspServerDefinition[];
  private readonly languageIdToServer: Map<string, LspServerDefinition>;

  constructor(userServers?: Record<string, LspServerUserConfig>) {
    this.servers = [];

    // Apply user overrides to built-in servers.
    const processedUserIds = new Set<string>();

    for (const builtin of BUILTIN_SERVERS) {
      const override = userServers?.[builtin.id];
      if (override) {
        processedUserIds.add(builtin.id);
        // User can disable a built-in server.
        if (override.enabled === false) continue;
        this.servers.push({
          ...builtin,
          command: override.command,
          args: override.args ?? builtin.args,
          rootMarkers: override.rootMarkers ?? builtin.rootMarkers,
          initializationOptions:
            override.initializationOptions ?? builtin.initializationOptions,
        });
      } else {
        this.servers.push(builtin);
      }
    }

    // Add user-defined servers that don't match any built-in ID.
    if (userServers) {
      for (const [id, config] of Object.entries(userServers)) {
        if (processedUserIds.has(id)) continue;
        if (config.enabled === false) continue;
        if (!config.languages || config.languages.length === 0) continue;

        this.servers.push({
          id,
          languageIds: config.languages,
          command: config.command,
          args: config.args ?? [],
          useShell: process.platform === 'win32',
          rootMarkers: config.rootMarkers ?? [],
          initializationOptions: config.initializationOptions,
        });
      }
    }

    // Build lookup from language ID → server definition.
    this.languageIdToServer = new Map();
    for (const server of this.servers) {
      for (const langId of server.languageIds) {
        this.languageIdToServer.set(langId, server);
      }
    }
  }

  /**
   * Find the server definition for a given file path, based on the file's
   * language ID.
   *
   * @returns The server definition, or undefined if no server handles this
   *   file type.
   */
  getServerForFile(filePath: string): LspServerDefinition | undefined {
    const languageId = getLanguageFromFilePath(filePath);
    if (!languageId) return undefined;
    return this.languageIdToServer.get(languageId);
  }

  /**
   * Get the LSP language ID for a file path.
   */
  getLanguageId(filePath: string): string | undefined {
    return getLanguageFromFilePath(filePath);
  }

  /**
   * Get all registered server definitions.
   */
  getAllServers(): readonly LspServerDefinition[] {
    return this.servers;
  }
}
