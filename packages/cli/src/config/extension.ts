/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MCPServerConfig,
  ExtensionInstallMetadata,
  CustomTheme,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { INSTALL_METADATA_FILENAME } from './extensions/variables.js';
import type { ExtensionSetting } from './extensions/extensionSettings.js';

/**
 * Extension definition as written to disk in gemini-extension.json files.
 * This should *not* be referenced outside of the logic for reading files.
 * If information is required for manipulating extensions (load, unload, update)
 * outside of the loading process that data needs to be stored on the
 * GeminiCLIExtension class defined in Core.
 */
export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
  settings?: ExtensionSetting[];
  /**
   * Custom themes contributed by this extension.
   * These themes will be registered when the extension is activated.
   */
  themes?: CustomTheme[];
  /**
   * Planning features configuration contributed by this extension.
   */
  plan?: {
    /**
     * The directory where planning artifacts are stored.
     */
    directory?: string;
  };
  /**
   * Used to migrate an extension to a new repository source.
   */
  migratedTo?: string;
}

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
 * Reads the `version` field from an extension's `package.json`, if one is
 * present alongside `gemini-extension.json` and has a string `version`. Returns
 * `undefined` for any failure (missing file, parse error, non-string version)
 * so callers can treat it as best-effort metadata.
 *
 * Intended to be called exactly once per extension during the load pipeline;
 * the result is then carried on `GeminiCLIExtension.packageVersion`.
 */
export async function getPackageVersion(
  extensionDir: string,
): Promise<string | undefined> {
  const pkgPath = path.join(extensionDir, 'package.json');
  try {
    const content = await fs.promises.readFile(pkgPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const pkg = JSON.parse(content) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Formats an extension version for display. When the config version (e.g.
 * `latest`) differs from the concrete `package.json` version, the latter is
 * appended in parentheses so users see meaningful info: `latest (0.20.2)`.
 */
export function formatVersion(
  configVersion: string,
  packageVersion?: string,
): string {
  if (!packageVersion || packageVersion === configVersion) {
    return configVersion;
  }
  return `${configVersion} (${packageVersion})`;
}
