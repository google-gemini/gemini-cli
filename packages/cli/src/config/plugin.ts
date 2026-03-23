/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type {
  ExtensionInstallMetadata,
  GeminiCLIExtension,
  CustomTheme,
} from '@google/gemini-cli-core';
import {
  EXTENSIONS_CONFIG_FILENAME,
  HIDDEN_OPEN_PLUGIN_CONFIG_FILENAME,
  OPEN_PLUGIN_CONFIG_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
} from './extensions/variables.js';
import type { ExtensionConfig } from './extension.js';
import type { ExtensionSetting } from './extensions/extensionSettings.js';

/**
 * Open Plugin manifest (plugin.json) v1.0.0
 * Based on https://open-plugins.com/plugin-builders/specification
 */
export interface OpenPluginConfig {
  name: string;
  version?: string;
  description?: string;
  author?: string | { name: string; email?: string; url?: string };
  license?: string;
  repository?: string | { type: string; url: string; directory?: string };
  homepage?: string;
  logo?: string;
  keywords?: string[];
  // Component fields (parsed but currently ignored during execution per v1 plan)
  skills?: string[] | Record<string, unknown>;
  agents?: string[] | Record<string, unknown>;
  hooks?: string[] | Record<string, unknown>;
  mcpServers?: string[] | Record<string, unknown>;
  lspServers?: string[] | Record<string, unknown>;
  rules?: string[] | Record<string, unknown>;
  // For Gemini CLI compatibility
  settings?: ExtensionSetting[];
  themes?: CustomTheme[];
}

export const OPEN_PLUGIN_NAME_REGEX = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export const openPluginSchema = z.object({
  name: z.string().min(1).max(64).regex(OPEN_PLUGIN_NAME_REGEX),
  version: z.string().optional(),
  description: z.string().optional(),
  author: z
    .union([
      z.string(),
      z.object({
        name: z.string(),
        email: z.string().optional(),
        url: z.string().optional(),
      }),
    ])
    .optional(),
  license: z.string().optional(),
  repository: z
    .union([
      z.string(),
      z.object({
        type: z.string(),
        url: z.string(),
        directory: z.string().optional(),
      }),
    ])
    .optional(),
  homepage: z.string().url().optional(),
  logo: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  skills: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  agents: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  hooks: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  mcpServers: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  lspServers: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  rules: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  settings: z.array(z.any()).optional(),
  themes: z.array(z.any()).optional(),
});

export interface ManifestInfo {
  type: 'gemini' | 'open-plugin';
  path: string;
}

export function findManifest(extensionDir: string): ManifestInfo | undefined {
  const geminiPath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (fs.existsSync(geminiPath)) {
    return { type: 'gemini', path: geminiPath };
  }

  const openPluginPath = path.join(extensionDir, OPEN_PLUGIN_CONFIG_FILENAME);
  if (fs.existsSync(openPluginPath)) {
    return { type: 'open-plugin', path: openPluginPath };
  }

  const hiddenOpenPluginPath = path.join(
    extensionDir,
    HIDDEN_OPEN_PLUGIN_CONFIG_FILENAME,
  );
  if (fs.existsSync(hiddenOpenPluginPath)) {
    return { type: 'open-plugin', path: hiddenOpenPluginPath };
  }

  return undefined;
}

/**
 * Loads an Open Plugin manifest and maps it to ExtensionConfig.
 */
export async function loadOpenPluginConfig(
  manifestPath: string,
  extensionDir: string,
  workspaceDir: string,
): Promise<ExtensionConfig> {
  const content = await fs.promises.readFile(manifestPath, 'utf-8');
  const json = JSON.parse(content) as unknown;
  const result = openPluginSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid plugin.json: ${result.error.message}`);
  }

  const rawConfig = result.data as OpenPluginConfig;

  // Hydrate metadata fields
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const hydratedConfig = recursivelyHydrateStrings(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    rawConfig as unknown as JsonObject,
    {
      extensionPath: extensionDir,
      PLUGIN_ROOT: extensionDir,
      workspacePath: workspaceDir,
      '/': path.sep,
      pathSeparator: path.sep,
    },
  ) as unknown as OpenPluginConfig;

  return {
    name: hydratedConfig.name,
    version: hydratedConfig.version ?? '0.0.0',
    manifestType: 'open-plugin',
    description: hydratedConfig.description,
    author: hydratedConfig.author,
    license: hydratedConfig.license,
    repository: hydratedConfig.repository,
    homepage: hydratedConfig.homepage,
    logo: hydratedConfig.logo,
    keywords: hydratedConfig.keywords,
    settings: hydratedConfig.settings,
    themes: hydratedConfig.themes,
    // Features are explicitly NOT mapped here for v1 plugins
  };
}

/**
 * Creates a GeminiCLIExtension from an Open Plugin directory.
 * v1: Does not enable skills, mcp servers, context files, or settings.
 */
export async function createOpenPlugin(
  pluginDir: string,
  manifestPath: string,
  isActive: boolean,
  id: string,
  workspaceDir: string,
  installMetadata?: ExtensionInstallMetadata,
): Promise<GeminiCLIExtension> {
  // Use loadOpenPluginConfig to get standard mapping
  const config = await loadOpenPluginConfig(
    manifestPath,
    pluginDir,
    workspaceDir,
  );

  return {
    name: config.name,
    version: config.version,
    path: pluginDir,
    isActive,
    id,
    installMetadata,
    manifestType: 'open-plugin',
    description: config.description,
    author: config.author,
    license: config.license,
    repository: config.repository,
    homepage: config.homepage,
    logo: config.logo,
    keywords: config.keywords,
    // v1: Features disabled
    contextFiles: [],
    mcpServers: undefined,
    excludeTools: undefined,
    settings: undefined,
    resolvedSettings: undefined,
    skills: undefined,
    agents: undefined,
    themes: config.themes,
  };
}
