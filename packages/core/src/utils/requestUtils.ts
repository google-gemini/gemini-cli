/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';

export function getRequestTextFromContents(contents: Content[]): string {
  return contents
    .flatMap((content) => content.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
}
