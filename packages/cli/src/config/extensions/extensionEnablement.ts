/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export type ExtensionEnablementState = 'enabled' | 'disabled';

export interface ExtensionEnablementConfig {
  default: ExtensionEnablementState;
  overrides: string[];
}

export interface AllExtensionsEnablementConfig {
  [extensionName: string]: ExtensionEnablementConfig;
}

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
    .replace(/\*/g, '.*'); // Convert * to .*

  return new RegExp(`^${regexString}$`);
}

/**
 * Determines if an extension is enabled based on the configuration and current path.
 * The last matching rule in the overrides list wins.
 *
 * @param config The enablement configuration for a single extension.
 * @param currentPath The absolute path of the current working directory.
 * @returns True if the extension is enabled, false otherwise.
 */
export class ExtensionEnablementManager {
  private static instance: ExtensionEnablementManager;
  private configFilePath: string;
  private configDir: string;

  private constructor(configDir: string) {
    this.configDir = configDir;
    this.configFilePath = path.join(configDir, 'extension-enablement.json');
  }

  static getInstance(configDir: string): ExtensionEnablementManager {
    if (!ExtensionEnablementManager.instance) {
      ExtensionEnablementManager.instance = new ExtensionEnablementManager(
        configDir,
      );
    }
    return ExtensionEnablementManager.instance;
  }

  isEnabled(extensionName: string, currentPath: string): boolean {
    const config = this.readConfig();
    const extensionConfig = config[extensionName];
    console.error(extensionName);
    console.error(extensionConfig);
    console.error(this.configFilePath);
    if (!extensionConfig) {
      // If not configured, assume the extension is enabled by default.
      return true;
    }

    let status: ExtensionEnablementState = extensionConfig.default;

    for (const rule of extensionConfig.overrides) {
      const isDisableRule = rule.startsWith('!');
      const globPattern = isDisableRule ? rule.substring(1) : rule;
      const regex = globToRegex(globPattern);

      if (regex.test(currentPath)) {
        status = isDisableRule ? 'disabled' : 'enabled';
      }
    }

    return status === 'enabled';
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

  enable(extensionName: string, scopePath?: string): void {
    const config = this.readConfig();
    if (!config[extensionName]) {
      config[extensionName] = { default: 'disabled', overrides: [] };
    }

    if (scopePath) {
      config[extensionName].overrides = config[extensionName].overrides.filter(
        (rule) => rule !== scopePath && rule !== `!${scopePath}`,
      );
      config[extensionName].overrides.push(scopePath);
    } else {
      config[extensionName].default = 'enabled';
    }

    this.writeConfig(config);
  }

  disable(extensionName: string, scopePath?: string): void {
    const config = this.readConfig();
    if (!config[extensionName]) {
      config[extensionName] = { default: 'enabled', overrides: [] };
    }

    if (scopePath) {
      config[extensionName].overrides = config[extensionName].overrides.filter(
        (rule) => rule !== scopePath && rule !== `!${scopePath}`,
      );
      config[extensionName].overrides.push(`!${scopePath}`);
    } else {
      config[extensionName].default = 'disabled';
    }

    this.writeConfig(config);
  }

  remove(extensionName: string): void {
    const config = this.readConfig();
    if (config[extensionName]) {
      delete config[extensionName];
      this.writeConfig(config);
    }
  }
}
