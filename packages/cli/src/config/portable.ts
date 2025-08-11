/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Settings } from './settings.js';

// Defines the structure of the portable configuration YAML file.
export interface PortableConfig {
  env?: Record<string, string>;
  cli?: Record<string, unknown>;
  settings?: Settings;
  context?: {
    geminiMd?: string;
    extensions?: Array<{ name: string; content: string }>;
    ignoreFiles?: string[];
  };
  commands?: Record<string, { description: string; prompt: string }>;
}

/**
 * Reads and parses the portable configuration from a YAML file.
 *
 * @param filePath The path to the YAML configuration file.
 * @returns The parsed portable configuration.
 */
export function loadPortableConfig(filePath: string): PortableConfig {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return yaml.load(fileContents) as PortableConfig;
  } catch (e) {
    console.error(`Error loading portable config file: ${e}`);
    process.exit(1);
  }
}
