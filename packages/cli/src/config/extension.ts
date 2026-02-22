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
import { z } from 'zod';
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
}

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

const extensionInstallMetadataSchema = z.object({
  source: z.string(),
  type: z.enum(['git', 'local', 'link', 'github-release']),
  releaseTag: z.string().optional(),
  ref: z.string().optional(),
  autoUpdate: z.boolean().optional(),
  allowPreRelease: z.boolean().optional(),
});

export function loadInstallMetadata(
  extensionDir: string,
): ExtensionInstallMetadata | undefined {
  const metadataFilePath = path.join(extensionDir, INSTALL_METADATA_FILENAME);
  try {
    const configContent = fs.readFileSync(metadataFilePath, 'utf-8');
    const metadata: unknown = JSON.parse(configContent);
    const result = extensionInstallMetadataSchema.safeParse(metadata);
    if (!result.success) {
      return undefined;
    }
    return result.data;
  } catch (_e) {
    return undefined;
  }
}
