/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '@gemini-cli/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string;
}

export function loadExtensions(workspaceDir: string): ExtensionConfig[] {
  const allExtensions = [
    ...loadExtensionsFromDir(workspaceDir),
    ...loadExtensionsFromDir(os.homedir()),
  ];

  const uniqueExtensions: ExtensionConfig[] = [];
  const seenNames = new Set<string>();
  for (const extension of allExtensions) {
    if (!seenNames.has(extension.name)) {
      console.log(
        `Loading extension: ${extension.name} (version: ${extension.version})`,
      );
      uniqueExtensions.push(extension);
      seenNames.add(extension.name);
    }
  }

  return uniqueExtensions;
}

function loadExtensionsFromDir(dir: string): ExtensionConfig[] {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: ExtensionConfig[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    if (!fs.statSync(extensionDir).isDirectory()) {
      console.error(
        `Warning: unexpected file ${extensionDir} in extensions directory.`,
      );
      continue;
    }

    const extensionPath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
    if (!fs.existsSync(extensionPath)) {
      console.error(
        `Warning: extension directory ${extensionDir} does not contain a config file ${extensionPath}.`,
      );
      continue;
    }

    try {
      const fileContent = fs.readFileSync(extensionPath, 'utf-8');
      const extensionConfig = JSON.parse(fileContent) as ExtensionConfig;
      if (!extensionConfig.name || !extensionConfig.version) {
        console.error(
          `Invalid extension config in ${extensionPath}: missing name or version.`,
        );
        continue;
      }

      if (extensionConfig.contextFileName) {
        const contextFilePath = path.join(
          extensionDir,
          extensionConfig.contextFileName,
        );
        if (fs.existsSync(contextFilePath)) {
          extensionConfig.contextFileName = contextFilePath;
        }
      } else {
        const contextFilePath = path.join(extensionDir, 'gemini.md');
        if (fs.existsSync(contextFilePath)) {
          extensionConfig.contextFileName = contextFilePath;
        }
      }

      extensions.push(extensionConfig);
    } catch (e) {
      console.error(
        `Failed to load extension config from ${extensionPath}:`,
        e,
      );
    }
  }

  return extensions;
}
