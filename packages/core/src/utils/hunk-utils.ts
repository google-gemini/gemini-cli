/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';

export interface Hunk {
  index: number;
  content: string;
  diff: string;
}

/**
 * Parses a git-style diff into individual hunks.
 */
export function parseHunks(diffContent: string): Hunk[] {
  const patches = Diff.parsePatch(diffContent);
  const hunks: Hunk[] = [];
  let hunkIndex = 0;

  for (const patch of patches) {
    for (const hunk of patch.hunks) {
      // Reconstruct the hunk as a diff snippet
      const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      const hunkContent = hunk.lines.join('\n') + '\n';
      hunks.push({
        index: hunkIndex++,
        content: hunkContent,
        diff: hunkHeader + hunkContent,
      });
    }
  }

  return hunks;
}

/**
 * Applies only the selected hunks to the original content.
 */
export function applySelectedHunks(
  originalContent: string,
  diffContent: string,
  acceptedHunkIndices: number[],
): string {
  const patches = Diff.parsePatch(diffContent);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const selectedHunks: any[] = [];
  let currentHunkIndex = 0;

  for (const patch of patches) {
    for (const hunk of patch.hunks) {
      if (acceptedHunkIndices.includes(currentHunkIndex)) {
        selectedHunks.push(hunk);
      }
      currentHunkIndex++;
    }
  }

  if (selectedHunks.length === 0) {
    return originalContent;
  }

  // Create a new patch with only selected hunks
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const filteredPatch: any = {
    ...patches[0],
    hunks: selectedHunks,
  };

  const result = Diff.applyPatch(originalContent, filteredPatch);
  if (result === false) {
    throw new Error('Failed to apply selected hunks safely.');
  }

  return result;
}
