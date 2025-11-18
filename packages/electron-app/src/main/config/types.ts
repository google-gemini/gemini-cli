/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomTheme {
  type: 'custom';
  name: string;
  [key: string]: string;
}

export interface CliSettings {
  terminalCwd?: string;
  env?: string | Record<string, string>;
  theme?: string;
  customThemes?: Record<string, CustomTheme>;
  mcpServers?: unknown;
  [key: string]: unknown;
}
