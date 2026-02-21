/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const REFERENCE_CONTENT_START = '--- Content from referenced files ---';
export const REFERENCE_CONTENT_END = '--- End of content ---';

/**
 * Maximum size (in bytes) for subprocess output accumulation.
 * Prevents V8 string length overflow crashes (0x1fffffe8 character limit).
 */
export const MAX_SUBPROCESS_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB
