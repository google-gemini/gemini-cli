/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { type Settings, MergeStrategy } from '../settingsSchema.js';
import {
  customDeepMerge,
  type MergeableObject,
} from '../../utils/deepMerge.js';

const RESTRICTED_TOP_LEVEL_KEYS = new Set([
  'security',
  'privacy',
  'telemetry',
  'admin',
]);

export interface ExtensionMergeResult {
  settings: Settings;
  warnings: string[];
}

/**
 * Merges configurations from multiple extensions into a single Settings object.
 * Filters restricted top-level settings, applies merge strategies for arrays/objects,
 * and handles scalar conflicts deterministically (alphabetical by extension name).
 */
export function mergeExtensionConfigurations(
  extensions: GeminiCLIExtension[],
  getMergeStrategyForPath: (path: string[]) => MergeStrategy | undefined,
): ExtensionMergeResult {
  const warnings: string[] = [];
  // Sort extensions alphabetically by name for deterministic tiebreaking
  const sortedExtensions = [...extensions].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  let mergedConfiguration = {};
  const scalarPaths = new Map<string, string[]>();

  function walk(obj: Record<string, unknown>, path: string[], extName: string) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...path, key];
      const mergeStrategy = getMergeStrategyForPath(currentPath);

      const isPlainObject =
        typeof value === 'object' && value !== null && !Array.isArray(value);

      if (isPlainObject) {
        if (mergeStrategy !== MergeStrategy.REPLACE) {
          // It's a nested object and we merge it
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          walk(value as Record<string, unknown>, currentPath, extName);
          continue;
        }
      }

      // If it's an array and strategy is CONCAT or UNION, they don't conflict.
      if (
        Array.isArray(value) &&
        (mergeStrategy === MergeStrategy.CONCAT ||
          mergeStrategy === MergeStrategy.UNION)
      ) {
        continue;
      }

      const pathString = currentPath.join('.');
      if (!scalarPaths.has(pathString)) {
        scalarPaths.set(pathString, []);
      }
      scalarPaths.get(pathString)!.push(extName);
    }
  }

  for (const extension of sortedExtensions) {
    if (!extension.configuration) {
      continue;
    }

    const filtered: Record<string, unknown> = {};
    const blockedKeys: string[] = [];

    for (const [key, value] of Object.entries(extension.configuration)) {
      if (RESTRICTED_TOP_LEVEL_KEYS.has(key)) {
        blockedKeys.push(key);
      } else {
        filtered[key] = value;
      }
    }

    if (blockedKeys.length > 0) {
      warnings.push(
        `Extension "${
          extension.name
        }" attempted to modify restricted settings: [${blockedKeys.join(
          ', ',
        )}]. These settings were ignored.`,
      );
    }

    walk(filtered, [], extension.name);

    mergedConfiguration = customDeepMerge(
      getMergeStrategyForPath,
      mergedConfiguration,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      filtered as MergeableObject,
    );
  }

  for (const [pathString, extNames] of scalarPaths.entries()) {
    if (extNames.length > 1) {
      warnings.push(
        `Conflict in extension configuration "${pathString}" provided by multiple extensions: [${extNames.join(
          ', ',
        )}]. Using value from "${
          extNames[extNames.length - 1]
        }" due to deterministic precedence.`,
      );
    }
  }

  return {
    settings: mergedConfiguration as Settings,
    warnings,
  };
}
