/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

/**
 * Returns true if the content represents a function response message.
 * Requires at least one part to avoid vacuous truth from Array.every([]).
 */
export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    !!content.parts &&
    content.parts.length > 0 &&
    content.parts.every((part) => !!part?.functionResponse)
  );
}

/**
 * Returns true if the content represents a function call message.
 * Requires at least one part to avoid vacuous truth from Array.every([]).
 */
export function isFunctionCall(content: Content): boolean {
  return (
    content.role === 'model' &&
    !!content.parts &&
    content.parts.length > 0 &&
    content.parts.every((part) => !!part?.functionCall)
  );
}
