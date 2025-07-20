/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Amazon Bedrock default models - using inference profiles for multi-region routing
export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';
export const DEFAULT_BEDROCK_SMALL_FAST_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
export const DEFAULT_BEDROCK_OPUS_MODEL = 'us.anthropic.claude-opus-4-20250514-v1:0';

// Additional Claude models available on Bedrock
export const DEFAULT_BEDROCK_SONNET_4_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
export const DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

// Note: DEFAULT_BEDROCK_MODEL is the default 3.7 Sonnet model
