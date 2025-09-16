/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ExtensionEnablementConfig {
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
  private configFilePath: string;
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.configFilePath = path.join(configDir, 'extension-enablement.json');
  }

  isEnabled(extensionName: string, currentPath: string): boolean {
    const config = this.readConfig();
    const extensionConfig = config[extensionName];
    // Extensions are enabled by default.
    let enabled = true;

    for (const rule of extensionConfig?.overrides ?? []) {
      const isDisableRule = rule.startsWith('!');
      const globPattern = isDisableRule ? rule.substring(1) : rule;
      const regex = globToRegex(globPattern);
      if (regex.test(currentPath)) {
        enabled = !isDisableRule;
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

    const pathWithGlob = `${scopePath}*`;
    const pathWithoutGlob = scopePath;

    const newPath = includeSubdirs ? pathWithGlob : pathWithoutGlob;
    const conflictingPath = includeSubdirs ? pathWithoutGlob : pathWithGlob;

    config[extensionName].overrides = config[extensionName].overrides.filter(
      (rule) =>
        rule !== conflictingPath &&
        rule !== `!${conflictingPath}` &&
        rule !== `!${newPath}`,
    );

    if (!config[extensionName].overrides.includes(newPath)) {
      config[extensionName].overrides.push(newPath);
    }

    this.writeConfig(config);
  }

  disable(
    extensionName: string,
    includeSubdirs: boolean,
    scopePath: string,
  ): void {
    const config = this.readConfig();
    if (!config[extensionName]) {
      config[extensionName] = { overrides: [] };
    }

    const pathWithGlob = `${scopePath}*`;
    const pathWithoutGlob = scopePath;

    const targetPath = includeSubdirs ? pathWithGlob : pathWithoutGlob;
    const newRule = `!${targetPath}`;
    const conflictingPath = includeSubdirs ? pathWithoutGlob : pathWithGlob;

    config[extensionName].overrides = config[extensionName].overrides.filter(
      (rule) =>
        rule !== conflictingPath &&
        rule !== `!${conflictingPath}` &&
        rule !== targetPath,
    );

    if (!config[extensionName].overrides.includes(newRule)) {
      config[extensionName].overrides.push(newRule);
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
