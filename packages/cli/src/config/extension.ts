/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthProviderType,
  type MCPServerConfig,
  type ExtensionInstallMetadata,
  type CustomTheme,
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

const extensionInstallMetadataSchema: z.ZodType<ExtensionInstallMetadata> =
  z.object({
    source: z.string(),
    type: z.enum(['git', 'local', 'link', 'github-release']),
    releaseTag: z.string().optional(),
    ref: z.string().optional(),
    autoUpdate: z.boolean().optional(),
    allowPreRelease: z.boolean().optional(),
  });

const extensionSettingSchema: z.ZodType<ExtensionSetting> = z.object({
  name: z.string(),
  description: z.string(),
  envVar: z.string(),
  sensitive: z.boolean().optional(),
});

const customThemeSchema: z.ZodType<CustomTheme> = z
  .object({
    type: z.literal('custom'),
    name: z.string(),
    text: z
      .object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        link: z.string().optional(),
        accent: z.string().optional(),
        response: z.string().optional(),
      })
      .optional(),
    background: z
      .object({
        primary: z.string().optional(),
        diff: z
          .object({
            added: z.string().optional(),
            removed: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    border: z
      .object({
        default: z.string().optional(),
      })
      .optional(),
    ui: z
      .object({
        comment: z.string().optional(),
        symbol: z.string().optional(),
        active: z.string().optional(),
        focus: z.string().optional(),
        gradient: z.array(z.string()).optional(),
      })
      .optional(),
    status: z
      .object({
        error: z.string().optional(),
        success: z.string().optional(),
        warning: z.string().optional(),
      })
      .optional(),
    Background: z.string().optional(),
    Foreground: z.string().optional(),
    LightBlue: z.string().optional(),
    AccentBlue: z.string().optional(),
    AccentPurple: z.string().optional(),
    AccentCyan: z.string().optional(),
    AccentGreen: z.string().optional(),
    AccentYellow: z.string().optional(),
    AccentRed: z.string().optional(),
    DiffAdded: z.string().optional(),
    DiffRemoved: z.string().optional(),
    Comment: z.string().optional(),
    Gray: z.string().optional(),
    DarkGray: z.string().optional(),
    GradientColors: z.array(z.string()).optional(),
  })
  .passthrough();

const mcpOauthConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    authorizationUrl: z.string().optional(),
    issuer: z.string().optional(),
    tokenUrl: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    audiences: z.array(z.string()).optional(),
    redirectUri: z.string().optional(),
    tokenParamName: z.string().optional(),
    registrationUrl: z.string().optional(),
  })
  .passthrough();

const mcpServerConfigSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
    url: z.string().optional(),
    httpUrl: z.string().optional(),
    headers: z.record(z.string()).optional(),
    tcp: z.string().optional(),
    type: z.enum(['stdio', 'sse', 'http']).optional(),
    timeout: z.number().optional(),
    trust: z.boolean().optional(),
    description: z.string().optional(),
    includeTools: z.array(z.string()).optional(),
    excludeTools: z.array(z.string()).optional(),
    oauth: mcpOauthConfigSchema.optional(),
    authProviderType: z.nativeEnum(AuthProviderType).optional(),
    targetAudience: z.string().optional(),
    targetServiceAccount: z.string().optional(),
  })
  .passthrough();

const extensionConfigSchema: z.ZodType<ExtensionConfig> = z
  .object({
    name: z.string(),
    version: z.string(),
    mcpServers: z.record(mcpServerConfigSchema).optional(),
    contextFileName: z.union([z.string(), z.array(z.string())]).optional(),
    excludeTools: z.array(z.string()).optional(),
    settings: z.array(extensionSettingSchema).optional(),
    themes: z.array(customThemeSchema).optional(),
    plan: z
      .object({
        directory: z.string().optional(),
      })
      .optional(),
    migratedTo: z.string().optional(),
  })
  .passthrough();

function formatExtensionConfigValidationError(
  configFilePath: string,
  error: z.ZodError,
): string {
  const missingField = error.issues.find(
    (issue) =>
      issue.code === 'invalid_type' &&
      issue.received === 'undefined' &&
      issue.path.length === 1 &&
      (issue.path[0] === 'name' || issue.path[0] === 'version'),
  );
  if (missingField) {
    return `Invalid configuration in ${configFilePath}: missing "${String(
      missingField.path[0],
    )}"`;
  }

  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return `Invalid configuration in ${configFilePath}`;
  }

  const issuePath = firstIssue.path.reduce((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : segment;
  }, '');

  return `Invalid configuration in ${configFilePath}: ${issuePath ? `${issuePath}: ` : ''}${firstIssue.message}`;
}

export function parseExtensionConfig(
  data: unknown,
  configFilePath: string,
): ExtensionConfig {
  const result = extensionConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      formatExtensionConfigValidationError(configFilePath, result.error),
    );
  }
  return result.data;
}

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
  } catch {
    return undefined;
  }
}
