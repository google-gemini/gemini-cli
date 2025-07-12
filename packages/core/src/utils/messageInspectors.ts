/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-20
 */

import { Content } from '@google/genai';

export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionResponse)
  );
}
