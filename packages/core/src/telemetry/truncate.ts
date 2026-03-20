/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { AttributeValue } from '@opentelemetry/api';

/**
 * Truncates values for telemetry to prevent massive strings (e.g., LLM prompts, tool arguments)
 * from being attached to spans and causing memory leaks.
 *
 * @param value The value to truncate
 * @param maxLength The maximum length of the string representation (default: 1000)
 */
export function truncateForTelemetry(
  value: unknown,
  maxLength: number = 1000,
): AttributeValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  let stringValue: string;
  if (typeof value === 'string') {
    stringValue = value;
  } else if (typeof value === 'object' || Array.isArray(value)) {
    try {
      stringValue = safeJsonStringify(value);
    } catch (_e) {
      stringValue = String(value);
    }
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  } else {
    stringValue = String(value);
  }

  if (stringValue && stringValue.length > maxLength) {
    return (
      stringValue.substring(0, maxLength) +
      `...[TRUNCATED: original length ${stringValue.length}]`
    );
  }

  return stringValue;
}
