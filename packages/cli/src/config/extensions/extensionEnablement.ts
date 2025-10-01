/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { type Extension } from '../extension.js';

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

export class ExtensionEnablementManager {
  private configFilePath: string;
  private configDir: string;
  // If non-empty, this overrides all other extension configuration and enables
  // only the ones in this list.
  private enabledExtensionNamesOverride: string[];

  constructor(configDir: string, enabledExtensionNames?: string[]) {
    this.configDir = configDir;
    this.configFilePath = path.join(configDir, 'extension-enablement.json');
    this.enabledExtensionNamesOverride =
      enabledExtensionNames?.map((name) => name.toLowerCase()) ?? [];
  }

  validateExtensionOverrides(extensions: Extension[]) {
    for (const name of this.enabledExtensionNamesOverride) {
      if (name === 'none') continue;
      if (
        !extensions.some(
          (ext) => ext.config.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        console.error(`Extension not found: ${name}`);
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
    const config = this.readConfig();
    const extensionConfig = config[extensionName];
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
    try {
      const content = fs.readFileSync(this.configFilePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      console.error('Error reading extension enablement config:', error);
      return {};
    }
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
    const config = this.readConfig();
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
    const config = this.readConfig();
    if (config[extensionName]) {
      delete config[extensionName];
      this.writeConfig(config);
    }
  }
}
