/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export interface Extension {
  config: ExtensionConfig;
  contextFiles: string[];
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export function loadExtensions(workspaceDir: string): Extension[] {
  const allExtensions = [
    ...loadExtensionsFromDir(workspaceDir),
    ...loadExtensionsFromDir(os.homedir()),
  ];

  const uniqueExtensions: Extension[] = [];
  const seenNames = new Set<string>();
  for (const extension of allExtensions) {
    if (!seenNames.has(extension.config.name)) {
      console.log(
        `Loading extension: ${extension.config.name} (version: ${extension.config.version})`,
      );
      uniqueExtensions.push(extension);
      seenNames.add(extension.config.name);
    }
  }

  return uniqueExtensions;
}

function loadExtensionsFromDir(dir: string): Extension[] {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: Extension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

function loadExtension(extensionDir: string): Extension | null {
  if (!fs.statSync(extensionDir).isDirectory()) {
    console.error(
      `Warning: unexpected file ${extensionDir} in extensions directory.`,
    );
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    console.error(
      `Warning: extension directory ${extensionDir} does not contain a config file ${configFilePath}.`,
    );
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfig;
    if (!config.name || !config.version) {
      console.error(
        `Invalid extension config in ${configFilePath}: missing name or version.`,
      );
      return null;
    }

    const contextFiles = getContextFileNames(config)
      .map((contextFileName) => path.join(extensionDir, contextFileName))
      .filter((contextFilePath) => fs.existsSync(contextFilePath));

    return {
      config,
      contextFiles,
    };
  } catch (e) {
    console.error(
      `Warning: error parsing extension config in ${configFilePath}: ${e}`,
    );
    return null;
  }
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return ['GEMINI.md'];
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

export function filterActiveExtensions(
  extensions: Extension[],
  enabledExtensions: string[],
): Extension[] {
  const lowerCaseEnabledExtensions = enabledExtensions.map((e) =>
    e.toLowerCase(),
  );
  const activeExtensions =
    enabledExtensions.length > 0
      ? extensions.filter((e) =>
          lowerCaseEnabledExtensions.includes(e.config.name.toLowerCase()),
        )
      : extensions;

  if (enabledExtensions.length > 0) {
    if (
      lowerCaseEnabledExtensions.length === 1 &&
      lowerCaseEnabledExtensions[0] === 'none'
    ) {
      activeExtensions.length = 0;
    } else {
      const activeNames = new Set(
        activeExtensions.map((e) => e.config.name.toLowerCase()),
      );
      for (const requestedExtension of lowerCaseEnabledExtensions) {
        if (!activeNames.has(requestedExtension)) {
          throw new Error(`Extension not found: ${requestedExtension}`);
        }
      }
    }

    const activeNames = new Set(
      activeExtensions.map((e) => e.config.name.toLowerCase()),
    );
    for (const extension of extensions) {
      const status = activeNames.has(extension.config.name.toLowerCase())
        ? 'Activated'
        : 'Disabled';
      console.log(
        `${status} extension: ${extension.config.name} (version: ${extension.config.version})`,
      );
    }
  }
  return activeExtensions;
}
