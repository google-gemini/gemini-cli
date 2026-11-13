/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type MCPServerConfig,
  type ExtensionInstallMetadata,
  type ExtensionSetting,
  type CustomTheme,
} from '@google/gemini-cli-core';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
} from '../config/extensions/variables.js';

export function createExtension({
  extensionsDir = 'extensions-dir',
  name = 'my-extension',
  version = '1.0.0',
  addContextFile = false,
  contextFileName = undefined as string | string[] | undefined,
  mcpServers = {} as Record<string, MCPServerConfig>,
  installMetadata = undefined as ExtensionInstallMetadata | undefined,
  settings = undefined as ExtensionSetting[] | undefined,
  themes = undefined as CustomTheme[] | undefined,
} = {}): string {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({
      name,
      version,
      contextFileName,
      mcpServers,
      settings,
      themes,
    }),
  );

  if (addContextFile) {
    fs.writeFileSync(path.join(extDir, 'GEMINI.md'), 'context');
  }

  if (contextFileName) {
    const files = Array.isArray(contextFileName)
      ? contextFileName
      : [contextFileName];
    for (const f of files) {
      if (typeof f === 'string') {
        try {
          const filePath = path.join(extDir, f);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, 'context');
        } catch {
          // Ignore errors for invalid paths in tests
        }
      }
    }
  }

  if (installMetadata) {
    fs.writeFileSync(
      path.join(extDir, INSTALL_METADATA_FILENAME),
      JSON.stringify(installMetadata),
    );
  }
  return extDir;
}
