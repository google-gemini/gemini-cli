/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig, GeminiCLIExtension } from '@google/gemini-cli-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.gemini', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export interface Extension {
  path: string;
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

function getSystemExtensionsPath(): string {
  if (process.env.GEMINI_CLI_SYSTEM_EXTENSIONS_PATH) {
    return process.env.GEMINI_CLI_SYSTEM_EXTENSIONS_PATH;
  }
  if (os.platform() === 'darwin') {
    return path.join(
      '/Library',
      'Application Support',
      'GeminiCli',
      'extensions',
    );
  } else if (os.platform() === 'win32') {
    if (process.env.PROGRAMDATA) {
      return path.join(process.env.PROGRAMDATA, 'gemini-cli', 'extensions');
    }
    return '';
  } else {
    return '/usr/share/gemini-cli/extensions';
  }
}

export function loadExtensions(workspaceDir: string): Extension[] {
  const allExtensions = [
    ...loadExtensionsFromBaseDir(workspaceDir),
    ...loadExtensionsFromBaseDir(os.homedir()),
    ...loadExtensionsFromDir(getSystemExtensionsPath()),
  ];

  const uniqueExtensions = new Map<string, Extension>();
  for (const extension of allExtensions) {
    if (!uniqueExtensions.has(extension.config.name)) {
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

function loadExtensionsFromBaseDir(baseDir: string): Extension[] {
  const extensionsDir = path.join(baseDir, EXTENSIONS_DIRECTORY_NAME);
  return loadExtensionsFromDir(extensionsDir);
}

function loadExtensionsFromDir(extensionsDir: string): Extension[] {
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
      path: extensionDir,
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

export function annotateActiveExtensions(
  extensions: Extension[],
  enabledExtensionNames: string[],
): GeminiCLIExtension[] {
  const annotatedExtensions: GeminiCLIExtension[] = [];

  if (enabledExtensionNames.length === 0) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: true,
      path: extension.path,
    }));
  }

  const lowerCaseEnabledExtensions = new Set(
    enabledExtensionNames.map((e) => e.trim().toLowerCase()),
  );

  if (
    lowerCaseEnabledExtensions.size === 1 &&
    lowerCaseEnabledExtensions.has('none')
  ) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: false,
      path: extension.path,
    }));
  }

  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  for (const extension of extensions) {
    const lowerCaseName = extension.config.name.toLowerCase();
    const isActive = lowerCaseEnabledExtensions.has(lowerCaseName);

    if (isActive) {
      notFoundNames.delete(lowerCaseName);
    }

    annotatedExtensions.push({
      name: extension.config.name,
      version: extension.config.version,
      isActive,
      path: extension.path,
    });
  }

  for (const requestedName of notFoundNames) {
    console.error(`Extension not found: ${requestedName}`);
  }

  return annotatedExtensions;
}

export function annotateActiveExtensionsFromDisabled(
  extensions: Extension[],
  disabledExtensionNames: string[],
): GeminiCLIExtension[] {
  const allAvailableNames = extensions.map((ext) => ext.config.name);
  const disabledNamesSet = new Set(
    disabledExtensionNames.map((name) => name.toLowerCase()),
  );
  const enabledExtensions = allAvailableNames.filter(
    (name) => !disabledNamesSet.has(name.toLowerCase()),
  );

  return annotateActiveExtensions(extensions, enabledExtensions);
}
