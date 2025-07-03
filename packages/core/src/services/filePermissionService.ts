/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { Config } from '../config/config.js';
import { minimatch } from 'minimatch'; // Using minimatch for glob pattern matching

export type FileOperation = 'read' | 'write';

export interface FilePermissionRule {
  description?: string;
  patterns: string[];
  operations: FileOperation[];
  effect: 'allow' | 'deny';
}

export interface SettingsFileFormat {
  // Assuming other settings might exist here
  filePermissions?: FilePermissionRule[];
}

export class FilePermissionService {
  private rules: FilePermissionRule[] = [];
  private targetDir: string;

  constructor(private config: Config) {
    this.targetDir = path.resolve(this.config.getTargetDir());
    // This is a placeholder for how settings would be loaded.
    // In a real scenario, the loaded and parsed settings object (from settings.json)
    // would be passed to the Config object, and we'd retrieve it from there.
    // For now, I'll simulate having a way to get these rules.
    this.targetDir = path.resolve(this.config.getTargetDir());
    const rules = this.config.getFilePermissionRules();
    if (rules) {
      this.rules = rules;
    }
  }

  /**
   * Checks if a given file operation is permitted based on the configured rules.
   *
   * @param absoluteFilePath The absolute path to the file.
   * @param operation The operation to check ('read' or 'write').
   * @returns True if the operation is allowed, false otherwise.
   */
  canPerformOperation(
    absoluteFilePath: string,
    operation: FileOperation,
  ): boolean {
    const relativeFilePath = path.relative(this.targetDir, absoluteFilePath);

    // Ensure the path is within the targetDir before checking rules.
    // This is a safeguard, as individual tools also perform this check.
    if (
      relativeFilePath.startsWith('..') ||
      path.isAbsolute(relativeFilePath)
    ) {
      // Path is outside the targetDir or resolution failed unexpectedly
      console.warn(
        `[FilePermissionService] Path ${absoluteFilePath} is outside targetDir ${this.targetDir}. Denying.`,
      );
      return false;
    }

    for (const rule of this.rules) {
      if (!rule.operations.includes(operation)) {
        continue; // Rule does not apply to this operation
      }

      for (const pattern of rule.patterns) {
        // Normalize patterns to be relative to targetDir if they aren't already complex globs
        // For simplicity, assuming patterns are meant to be relative to targetDir.
        // More sophisticated glob handling might be needed if patterns can be absolute.
        if (minimatch(relativeFilePath, pattern, { dot: true })) {
          // Rule matches
          if (rule.effect === 'allow') {
            return true; // Explicit allow
          } else if (rule.effect === 'deny') {
            return false; // Explicit deny
          }
        }
      }
    }

    // Default deny: If no rules explicitly allow the operation
    return false;
  }
}
