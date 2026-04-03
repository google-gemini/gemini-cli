/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type MCPServerConfig,
  type ExtensionInstallMetadata,
  type CustomTheme,
  type PolicyRule,
  type SafetyCheckerRule,
  type GeminiCLIExtension,
  type ResolvedExtensionSetting,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { ExtensionSetting } from './extensions/extensionSettings.js';
import {
  INSTALL_METADATA_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
} from './extensions/variables.js';

/**
 * Extension definition as written to disk in gemini-extension.json files.
 * This should *not* be referenced outside of the logic for reading files.
 * If information is required for manipulating extensions (load, unload, update)
 * outside of the loading process that data needs to be stored on the
 * GeminiCLIExtension class defined in Core.
 */
export const geminiExtensionSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
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
  mcpServers: z.record(z.custom<MCPServerConfig>()).optional(),
  contextFileName: z.union([z.string(), z.array(z.string())]).optional(),
  excludeTools: z.array(z.string()).optional(),
  settings: z.array(z.custom<ExtensionSetting>()).optional(),
  /**
   * Custom themes contributed by this extension.
   * These themes will be registered when the extension is activated.
   */
  themes: z.array(z.custom<CustomTheme>()).optional(),
  /**
   * Planning features configuration contributed by this extension.
   */
  plan: z
    .object({
      directory: z.string().optional(),
    })
    .optional(),
  /**
   * Used to migrate an extension to a new repository source.
   */
  migratedTo: z.string().optional(),
});

/**
 *  Internal representation of an extension configuration after being loaded and validated.
 */
export type ExtensionConfig = z.infer<typeof geminiExtensionSchema> & {
  manifestType?: 'gemini' | 'open-plugin';
  keywords?: string[];
  homepage?: string;
  repository?: string;
};

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

export function loadInstallMetadata(
  extensionDir: string,
): ExtensionInstallMetadata | undefined {
  const metadataFilePath = path.join(extensionDir, INSTALL_METADATA_FILENAME);
  try {
    const configContent = fs.readFileSync(metadataFilePath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const metadata = JSON.parse(configContent) as ExtensionInstallMetadata;
    return metadata;
  } catch {
    return undefined;
  }
}

/**
 * Loads a Gemini CLI extension manifest.
 */
export async function loadGeminiConfig(
  manifestPath: string,
  extensionDir: string,
  workspaceDir: string,
): Promise<ExtensionConfig> {
  const content = await fs.promises.readFile(manifestPath, 'utf-8');
  const json = JSON.parse(content) as unknown;
  const result = geminiExtensionSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid gemini-extension.json: ${result.error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const rawConfig = result.data as unknown as ExtensionConfig;

  // Hydrate strings with basic context
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const config = recursivelyHydrateStrings(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    rawConfig as unknown as JsonObject,
    {
      extensionPath: extensionDir,
      PLUGIN_ROOT: extensionDir,
      workspacePath: workspaceDir,
      '/': path.sep,
      pathSeparator: path.sep,
    },
  ) as unknown as ExtensionConfig;

  config.manifestType = 'gemini';
  return config;
}

/**
 * Factory for creating a GeminiCLIExtension from a Gemini config.
 */
export function createGeminiExtension(
  config: ExtensionConfig,
  extensionDir: string,
  isActive: boolean,
  id: string,
  contextFiles: string[],
  resolvedSettings: ResolvedExtensionSetting[],
  installMetadata?: ExtensionInstallMetadata,
  hooks?: GeminiCLIExtension['hooks'],
  skills?: GeminiCLIExtension['skills'],
  agents?: GeminiCLIExtension['agents'],
  rules?: PolicyRule[],
  checkers?: SafetyCheckerRule[],
): GeminiCLIExtension {
  return {
    name: config.name,
    version: config.version,
    path: extensionDir,
    isActive,
    id,
    installMetadata,
    manifestType: 'gemini',
    description: config.description,
    author: config.author,
    license: config.license,
    contextFiles,
    mcpServers: config.mcpServers,
    excludeTools: config.excludeTools,
    settings: config.settings,
    resolvedSettings,
    hooks,
    skills,
    agents,
    themes: config.themes,
    rules,
    checkers,
    plan: config.plan,
    migratedTo: config.migratedTo,
  };
}
