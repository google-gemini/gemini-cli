/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { coreEvents, type GeminiCLIExtension } from '@google/gemini-cli-core';
import { ExtensionStorage } from './storage.js';
import { z } from 'zod';

export interface ExtensionEnablementConfig {
  overrides: string[];
}

export interface AllExtensionsEnablementConfig {
  [extensionName: string]: ExtensionEnablementConfig;
}

export class Override {
  constructor(
    public baseRule: string,
    public isDisable: boolean,
    public includeSubdirs: boolean,
  ) {}

  static fromInput(inputRule: string, includeSubdirs: boolean): Override {
    const isDisable = inputRule.startsWith('!');
    let baseRule = isDisable ? inputRule.substring(1) : inputRule;
    baseRule = ensureLeadingAndTrailingSlash(baseRule);
    return new Override(baseRule, isDisable, includeSubdirs);
  }

  static fromFileRule(fileRule: string): Override {
    const isDisable = fileRule.startsWith('!');
    let baseRule = isDisable ? fileRule.substring(1) : fileRule;
    const includeSubdirs = baseRule.endsWith('*');
    baseRule = includeSubdirs
      ? baseRule.substring(0, baseRule.length - 1)
      : baseRule;
    return new Override(baseRule, isDisable, includeSubdirs);
  }

  conflictsWith(other: Override): boolean {
    if (this.baseRule === other.baseRule) {
      return (
        this.includeSubdirs !== other.includeSubdirs ||
        this.isDisable !== other.isDisable
      );
    }
    return false;
  }

  isEqualTo(other: Override): boolean {
    return (
      this.baseRule === other.baseRule &&
      this.includeSubdirs === other.includeSubdirs &&
      this.isDisable === other.isDisable
    );
  }

  asRegex(): RegExp {
    return globToRegex(`${this.baseRule}${this.includeSubdirs ? '*' : ''}`);
  }

  isChildOf(parent: Override) {
    if (!parent.includeSubdirs) {
      return false;
    }
    return parent.asRegex().test(this.baseRule);
  }

  output(): string {
    return `${this.isDisable ? '!' : ''}${this.baseRule}${this.includeSubdirs ? '*' : ''}`;
  }

  matchesPath(path: string) {
    return this.asRegex().test(path);
  }
}

const ensureLeadingAndTrailingSlash = function (dirPath: string): string {
  // Normalize separators to forward slashes for consistent matching across platforms.
  let result = dirPath.replace(/\\/g, '/');
  if (result.charAt(0) !== '/') {
    result = '/' + result;
  }
  if (result.charAt(result.length - 1) !== '/') {
    result = result + '/';
  }
  return result;
};

/**
 * Converts a glob pattern to a RegExp object.
 * This is a simplified implementation that supports `*`.
 *
 * @param glob The glob pattern to convert.
 * @returns A RegExp object.
 */
function globToRegex(glob: string): RegExp {
  const regexString = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex characters
    .replace(/(\/?)\*/g, '($1.*)?'); // Convert * to optional group

  return new RegExp(`^${regexString}$`);
}

/**
 * Outcome of reading the enablement file.
 *
 * `missing` and `unreadable` must stay apart: a file that exists but cannot be
 * read says nothing about which extensions the user disabled, so it can
 * neither be treated as empty nor be overwritten.
 */
type ReadConfigResult =
  | { status: 'ok' | 'missing'; config: AllExtensionsEnablementConfig }
  | { status: 'unreadable' };

/**
 * Thrown when a write is refused because the config on disk is unreadable.
 * writeConfig serialises the whole map, so writing what was read as {} drops
 * every entry the file still holds.
 */
export class ExtensionEnablementConfigError extends Error {
  constructor(configFilePath: string) {
    super(
      `Cannot update extension enablement: ${configFilePath} exists but could not be read. ` +
        `Repair or delete that file and retry. Until then every extension is treated as disabled.`,
    );
    this.name = 'ExtensionEnablementConfigError';
  }
}

export class ExtensionEnablementManager {
  private configFilePath: string;
  private configDir: string;
  // If non-empty, this overrides all other extension configuration and enables
  // only the ones in this list.
  private enabledExtensionNamesOverride: string[];
  private hasReportedUnreadable = false;

  constructor(enabledExtensionNames?: string[]) {
    this.configDir = ExtensionStorage.getUserExtensionsDir();
    this.configFilePath = path.join(
      this.configDir,
      'extension-enablement.json',
    );
    this.enabledExtensionNamesOverride =
      enabledExtensionNames?.map((name) => name.toLowerCase()) ?? [];
  }

  validateExtensionOverrides(extensions: GeminiCLIExtension[]) {
    for (const name of this.enabledExtensionNamesOverride) {
      if (name === 'none') continue;
      if (
        !extensions.some((ext) => ext.name.toLowerCase() === name.toLowerCase())
      ) {
        coreEvents.emitFeedback('error', `Extension not found: ${name}`);
      }
    }
  }

  /**
   * Determines if an extension is enabled based on its name and the current
   * path. The last matching rule in the overrides list wins.
   *
   * @param extensionName The name of the extension.
   * @param currentPath The absolute path of the current working directory.
   * @returns True if the extension is enabled, false otherwise.
   */
  isEnabled(extensionName: string, currentPath: string): boolean {
    // If we have a single override called 'none', this disables all extensions.
    // Typically, this comes from the user passing `-e none`.
    if (
      this.enabledExtensionNamesOverride.length === 1 &&
      this.enabledExtensionNamesOverride[0] === 'none'
    ) {
      return false;
    }

    // If we have explicit overrides, only enable those extensions.
    if (this.enabledExtensionNamesOverride.length > 0) {
      // When checking against overrides ONLY, we use a case insensitive match.
      // The override names are already lowercased in the constructor.
      return this.enabledExtensionNamesOverride.includes(
        extensionName.toLocaleLowerCase(),
      );
    }

    // Otherwise, we use the configuration settings
    const result = this.readConfigResult();
    if (result.status === 'unreadable') {
      // Fail closed. Extensions default to enabled, so treating an unreadable
      // file as empty silently turns every deliberate disable back on.
      return false;
    }
    const extensionConfig = result.config[extensionName];
    // Extensions are enabled by default.
    let enabled = true;
    const allOverrides = extensionConfig?.overrides ?? [];
    for (const rule of allOverrides) {
      const override = Override.fromFileRule(rule);
      if (override.matchesPath(ensureLeadingAndTrailingSlash(currentPath))) {
        enabled = !override.isDisable;
      }
    }
    return enabled;
  }

  readConfig(): AllExtensionsEnablementConfig {
    const result = this.readConfigResult();
    return result.status === 'unreadable' ? {} : result.config;
  }

  private readConfigResult(): ReadConfigResult {
    let content: string;
    try {
      content = fs.readFileSync(this.configFilePath, 'utf-8');
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        this.hasReportedUnreadable = false;
        return { status: 'missing', config: {} };
      }
      this.reportUnreadable(error);
      return { status: 'unreadable' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      this.reportUnreadable(error);
      return { status: 'unreadable' };
    }

    const schema = z.record(
      z.string(),
      z.object({ overrides: z.array(z.string()) }),
    );
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      // Valid JSON of the wrong shape fails open by the same route, so it is
      // unreadable too.
      this.reportUnreadable(validated.error);
      return { status: 'unreadable' };
    }

    this.hasReportedUnreadable = false;
    return { status: 'ok', config: validated.data };
  }

  /**
   * Report an unreadable config once per stretch of failures. isEnabled runs
   * for every extension on every startup, so emitting on each read would bury
   * the message in copies of itself.
   */
  private reportUnreadable(error: unknown): void {
    if (this.hasReportedUnreadable) {
      return;
    }
    this.hasReportedUnreadable = true;
    coreEvents.emitFeedback(
      'error',
      `Failed to read extension enablement config at ${this.configFilePath}. ` +
        `Every extension is treated as disabled until the file is repaired or deleted.`,
      error,
    );
  }

  writeConfig(config: AllExtensionsEnablementConfig): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
  }

  enable(
    extensionName: string,
    includeSubdirs: boolean,
    scopePath: string,
  ): void {
    const result = this.readConfigResult();
    if (result.status === 'unreadable') {
      throw new ExtensionEnablementConfigError(this.configFilePath);
    }
    const config = result.config;
    if (!config[extensionName]) {
      config[extensionName] = { overrides: [] };
    }
    const override = Override.fromInput(scopePath, includeSubdirs);
    const overrides = config[extensionName].overrides.filter((rule) => {
      const fileOverride = Override.fromFileRule(rule);
      if (
        fileOverride.conflictsWith(override) ||
        fileOverride.isEqualTo(override)
      ) {
        return false; // Remove conflicts and equivalent values.
      }
      return !fileOverride.isChildOf(override);
    });
    overrides.push(override.output());
    config[extensionName].overrides = overrides;
    this.writeConfig(config);
  }

  disable(
    extensionName: string,
    includeSubdirs: boolean,
    scopePath: string,
  ): void {
    this.enable(extensionName, includeSubdirs, `!${scopePath}`);
  }

  remove(extensionName: string): void {
    const result = this.readConfigResult();
    if (result.status === 'unreadable') {
      throw new ExtensionEnablementConfigError(this.configFilePath);
    }
    const config = result.config;
    if (config[extensionName]) {
      delete config[extensionName];
      this.writeConfig(config);
    }
  }
}
