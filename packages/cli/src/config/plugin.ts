/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  loadSkillsFromDir,
  type ExtensionInstallMetadata,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import {
  EXTENSIONS_CONFIG_FILENAME,
  STANDARD_OPEN_PLUGIN_CONFIG_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
} from './extensions/variables.js';
import type { ExtensionConfig } from './extension.js';

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
  keywords?: string[];
  homepage?: string;
  repository?: string;
  // Component fields (parsed but currently ignored during execution per v1 plan)
  skills?: OpenPluginDiscoveryField;
  mcpServers?: OpenPluginDiscoveryField | Record<string, unknown>;
}

export type OpenPluginDiscoveryField = string | string[] | { paths: string[] };

export const OPEN_PLUGIN_NAME_REGEX = /^[a-z0-9.-]{1,64}$/;

/**
 * Validates that a discovery path starts with ./ and does not contain ../
 */
const isValidDiscoveryPath = (p: string) =>
  p.startsWith('./') && !p.includes('../');

const discoveryFieldSchema = z.union([
  z.string().refine(isValidDiscoveryPath, {
    message: 'Path must start with "./" and cannot contain "../"',
  }),
  z.array(
    z.string().refine(isValidDiscoveryPath, {
      message: 'Path must start with "./" and cannot contain "../"',
    }),
  ),
  z.object({
    paths: z.array(
      z.string().refine(isValidDiscoveryPath, {
        message: 'Path must start with "./" and cannot contain "../"',
      }),
    ),
  }),
]);

export const openPluginSchema = z.object({
  name: z.string().trim().min(1).max(64).regex(OPEN_PLUGIN_NAME_REGEX),
  version: z.string().trim().optional(),
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
  keywords: z.array(z.string()).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  skills: discoveryFieldSchema.optional(),
  mcpServers: z.union([discoveryFieldSchema, z.record(z.any())]).optional(),
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

  const standardOpenPluginPath = path.join(
    extensionDir,
    STANDARD_OPEN_PLUGIN_CONFIG_FILENAME,
  );
  if (fs.existsSync(standardOpenPluginPath)) {
    return { type: 'open-plugin', path: standardOpenPluginPath };
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
    keywords: hydratedConfig.keywords,
    homepage: hydratedConfig.homepage,
    repository: hydratedConfig.repository,
    // Features are explicitly NOT mapped here for v1 plugins
  };
}

/**
 * Creates a GeminiCLIExtension from an Open Plugin directory.
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

  const hydrationContext = {
    extensionPath: pluginDir,
    PLUGIN_ROOT: pluginDir,
    workspacePath: workspaceDir,
    '/': path.sep,
    pathSeparator: path.sep,
  };

  const skills = await resolvePluginSkills(
    pluginDir,
    config.name,
    hydrationContext,
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
    keywords: config.keywords,
    homepage: config.homepage,
    repository: config.repository,
    // v1: Features disabled
    contextFiles: [],
    mcpServers: undefined,
    excludeTools: undefined,
    settings: undefined,
    resolvedSettings: undefined,
    skills,
    agents: undefined,
    themes: undefined,
  };
}

/**
 * Discovers and namespaces skills for an Open Plugin.
 */
async function resolvePluginSkills(
  pluginDir: string,
  pluginName: string,
  hydrationContext: Record<string, string>,
): Promise<GeminiCLIExtension['skills']> {
  const skillsDir = path.join(pluginDir, 'skills');
  const discoveredSkills = await loadSkillsFromDir(skillsDir);

  if (discoveredSkills.length === 0) {
    return undefined;
  }

  return discoveredSkills.map((skill) => ({
    ...recursivelyHydrateStrings(skill, hydrationContext),
    name: `${pluginName}:${skill.name}`,
    extensionName: pluginName,
  }));
}
