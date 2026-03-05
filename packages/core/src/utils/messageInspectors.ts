/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

/**
 * Returns true if the given content represents a function response turn.
 * A function response is a user-role message where every part is a
 * `functionResponse` (i.e. the result of a previously invoked tool).
 * @param content The conversation content to inspect.
 * @returns `true` when all parts of the content are function responses.
 */
export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionResponse)
  );
}

/**
 * Returns true if the given content represents a function call turn.
 * A function call is a model-role message where every part is a
 * `functionCall` (i.e. a request to invoke a tool).
 * @param content The conversation content to inspect.
 * @returns `true` when all parts of the content are function calls.
 */
export function isFunctionCall(content: Content): boolean {
  return (
    content.role === 'model' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionCall)
  );
}
