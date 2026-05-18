/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stringWidth from 'string-width';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const nonPrintingCodePointRegex =
  /[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]/u;

const thaiOrLaoSaraAmRegex = /[\u0E33\u0EB3]/u;

const THAI_SARA_AM = 0x0e33;
const LAO_SARA_AM = 0x0eb3;

function isThaiOrLaoSaraAm(codePoint: number | undefined): boolean {
  return codePoint === THAI_SARA_AM || codePoint === LAO_SARA_AM;
}

function countSaraAmCodePoints(segment: string): number {
  let count = 0;

  for (const char of segment) {
    if (isThaiOrLaoSaraAm(char.codePointAt(0))) {
      count++;
    }
  }

  return count;
}

function getFirstVisibleCodePoint(segment: string): number | undefined {
  for (const char of segment) {
    if (!nonPrintingCodePointRegex.test(char)) {
      return char.codePointAt(0);
    }
  }

  return undefined;
}

function getSaraAmWidthAdjustment(input: string): number {
  if (!thaiOrLaoSaraAmRegex.test(input)) {
    return 0;
  }

  let adjustment = 0;

  for (const { segment } of segmenter.segment(input)) {
    if (!thaiOrLaoSaraAmRegex.test(segment)) {
      continue;
    }

    // string-width treats Thai/Lao SARA AM as zero-width when it is merged
    // into a grapheme cluster, but terminals still allocate a full cell for it.
    if (isThaiOrLaoSaraAm(getFirstVisibleCodePoint(segment))) {
      continue;
    }

    adjustment += countSaraAmCodePoints(segment);
  }

  return adjustment;
}

export function getTerminalStringWidth(input: string): number {
  return stringWidth(input) + getSaraAmWidthAdjustment(input);
}
