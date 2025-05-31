/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentResponse } from '@google/genai';

export function getResponseText(
  response: GenerateContentResponse,
): string | undefined {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .join('') || undefined
  );
}
