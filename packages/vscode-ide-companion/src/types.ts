/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a custom command loaded from a .toml file in ~/.gemini/commands/
 */
export interface CustomCommand {
  /**
   * Unique identifier for the command (e.g., "explain", "refactor:pure").
   */
  name: string;

  /**
   * Human-readable display name shown in the context menu.
   */
  displayName: string;

  /**
   * The prompt template from the .toml file.
   */
  prompt: string;

  /**
   * Optional description from the .toml file.
   */
  description?: string;

  /**
   * Absolute path to the source .toml file.
   */
  filePath: string;

  /**
   * Whether this is a nested command (contains ':' in name).
   */
  isNested: boolean;

  /**
   * The parent category for nested commands.
   */
  category?: string;
}

/**
 * Raw structure of a .toml command definition file.
 */
export interface TomlCommandDefinition {
  /**
   * The prompt template (required).
   */
  prompt: string;

  /**
   * Optional description of the command.
   */
  description?: string;
}

/**
 * Configuration options for the CommandScanner.
 */
export interface CommandScannerOptions {
  /**
   * Base directory to scan for .toml command files.
   */
  commandsDir?: string;

  /**
   * Whether to watch the commands directory for changes.
   */
  watch?: boolean;

  /**
   * Logger function for debugging.
   */
  log?: (message: string) => void;
}

/**
 * Result of scanning the commands directory.
 */
export interface CommandScanResult {
  /**
   * All successfully loaded commands.
   */
  commands: CustomCommand[];

  /**
   * Files that failed to load.
   */
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}
