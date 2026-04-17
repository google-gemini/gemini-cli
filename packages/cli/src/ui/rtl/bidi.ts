/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import bidiFactory from 'bidi-js';

export const bidi = bidiFactory();

export type ClusteredChar = {
  value: string;
  width: number;
};

/**
 * Reorders an array of ClusteredChars from logical to visual order.
 */
export function reorderBidi<T extends ClusteredChar>(characters: T[]): T[] {
  if (characters.length === 0) return characters;

  const plainText = characters.map((c) => c.value).join('');

  if (!hasRTLCharacters(plainText)) {
    return characters;
  }

  const { levels } = bidi.getEmbeddingLevels(plainText, 'auto');

  // Map logical character levels. Since a single ClusteredChar can be multiple
  // UTF-16 code units (e.g. emoji or certain accents), we need to align levels.
  const charLevels: number[] = [];
  let offset = 0;
  for (let i = 0; i < characters.length; i++) {
    charLevels.push(levels[offset]);
    offset += characters[i].value.length;
  }

  const reordered = [...characters];
  const maxLevel = Math.max(...charLevels);

  // Reorder levels based on the Bidi algorithm (simplified reordering part)
  for (let level = maxLevel; level >= 1; level--) {
    let i = 0;
    while (i < reordered.length) {
      if (charLevels[i] >= level) {
        let j = i + 1;
        while (j < reordered.length && charLevels[j] >= level) {
          j++;
        }
        reverseRange(reordered, i, j - 1);
        reverseRangeNumbers(charLevels, i, j - 1);
        i = j;
      } else {
        i++;
      }
    }
  }

  return reordered;
}

function reverseRange<T>(arr: T[], start: number, end: number): void {
  while (start < end) {
    const temp = arr[start];
    arr[start] = arr[end]!;
    arr[end] = temp;
    start++;
    end--;
  }
}

function reverseRangeNumbers(arr: number[], start: number, end: number): void {
  while (start < end) {
    const temp = arr[start];
    arr[start] = arr[end]!;
    arr[end] = temp;
    start++;
    end--;
  }
}

function hasRTLCharacters(text: string): boolean {
  return /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0780-\u07BF\u0700-\u074F]/u.test(
    text,
  );
}
