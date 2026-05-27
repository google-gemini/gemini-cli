/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

/**
 * Returns `true` if the given content represents a tool function response.
 *
 * A valid function response must:
 * - have role `'user'`
 * - have a non-empty `parts` array
 * - have every `part` populated with a `functionResponse`
 *
 * The non-empty check is required because `Array.prototype.every` returns
 * `true` for empty arrays (vacuous truth), which would otherwise cause
 * messages with `parts: []` to be misclassified as function responses.
 *
 * `Array.isArray` and optional chaining are used to harden against runtime
 * shapes where `parts` is not actually an array or contains nullish entries.
 */
export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    Array.isArray(content.parts) &&
    content.parts.length > 0 &&
    content.parts.every((part) => !!part?.functionResponse)
  );
}

/**
 * Returns `true` if the given content represents a model tool function call.
 *
 * A valid function call must:
 * - have role `'model'`
 * - have a non-empty `parts` array
 * - have every `part` populated with a `functionCall`
 *
 * The non-empty check is required because `Array.prototype.every` returns
 * `true` for empty arrays (vacuous truth), which would otherwise cause
 * messages with `parts: []` to be misclassified as function calls.
 *
 * `Array.isArray` and optional chaining are used to harden against runtime
 * shapes where `parts` is not actually an array or contains nullish entries.
 */
export function isFunctionCall(content: Content): boolean {
  return (
    content.role === 'model' &&
    Array.isArray(content.parts) &&
    content.parts.length > 0 &&
    content.parts.every((part) => !!part?.functionCall)
  );
}
