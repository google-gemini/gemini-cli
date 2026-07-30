/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const REFERENCE_CONTENT_START = '--- Content from referenced files ---';
export const REFERENCE_CONTENT_END = '--- End of content ---';

export const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
export const MAX_LINE_LENGTH_TEXT_FILE = 2000;
export const MAX_FILE_SIZE_MB = 20;

export const EMPTY_RESPONSE_COMPRESS_SUGGESTION =
  'The model returned an empty text response. If your context window is near capacity, try using /compress.';

export const THINKING_ONLY_COMPRESS_SUGGESTION =
  'The model returned reasoning thoughts but no final response text. If your context window is near capacity, try using /compress.';

export const MAX_TOKENS_EXCEEDED_SUGGESTION =
  'Model response was truncated because it exceeded the token limit. Try using /compress to free up context space.';

export const SAFETY_BLOCKED_MESSAGE =
  'The model response was blocked due to safety settings.';

export const RECITATION_BLOCKED_MESSAGE =
  'The model response was blocked due to recitation/copyright filters.';

export const OTHER_BLOCKED_MESSAGE =
  'The model response was blocked due to other policy settings.';

export const TRUE_EMPTY_RESPONSE_MESSAGE =
  'The model returned an empty response with no text or thoughts. This may be a transient API issue; please try again.';
