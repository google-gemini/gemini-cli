/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import levenshtein from 'fast-levenshtein';

/**
 * Normalizes a tool name by converting kebab-case to snake_case.
 * @param name The tool name to normalize.
 * @returns The normalized tool name.
 */
export function normalizeToolName(name: string): string {
  return name.replaceAll('-', '_');
}

/**
 * Result of a fuzzy match operation.
 */
export interface FuzzyMatchResult {
  /** The repaired tool name, if a unique match was found. */
  repairedName?: string;
  /** Whether the match was ambiguous (multiple matches at the same minimum distance). */
  isAmbiguous: boolean;
  /** The distance of the best match found. */
  distance: number;
}

/**
 * Finds the closest match for a tool name from a list of available names.
 * @param hallucinatedName The tool name to find a match for.
 * @param availableNames The list of valid tool names.
 * @param maxDistance The maximum Levenshtein distance allowed (default: 2).
 * @returns A FuzzyMatchResult indicating the best match found.
 */
export function getClosestMatch(
  hallucinatedName: string,
  availableNames: string[],
  maxDistance = 2,
): FuzzyMatchResult {
  let minDistance = Infinity;
  let matches: string[] = [];

  for (const name of availableNames) {
    const distance = levenshtein.get(hallucinatedName, name);
    if (distance < minDistance) {
      minDistance = distance;
      matches = [name];
    } else if (distance === minDistance) {
      matches.push(name);
    }
  }

  if (minDistance > maxDistance) {
    return { isAmbiguous: false, distance: minDistance };
  }

  if (matches.length > 1) {
    return { isAmbiguous: true, distance: minDistance };
  }

  return {
    repairedName: matches[0],
    isAmbiguous: false,
    distance: minDistance,
  };
}
