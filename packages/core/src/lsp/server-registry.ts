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
];

/**
 * Registry that resolves file paths to language server definitions.
 *
 * Supports user overrides via settings: if a user configures a server for a
 * given id (e.g. `lsp.servers.typescript`), its command/args replace the
 * built-in definition.
 */
export class LspServerRegistry {
  private readonly servers: LspServerDefinition[];
  private readonly languageIdToServer: Map<string, LspServerDefinition>;

  constructor(userServers?: Record<string, LspServerUserConfig>) {
    // Start with built-in servers, apply user overrides.
    this.servers = BUILTIN_SERVERS.map((builtin) => {
      const override = userServers?.[builtin.id];
      if (override) {
        return {
          ...builtin,
          command: override.command,
          args: override.args ?? builtin.args,
        };
      }
      return builtin;
    });

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
