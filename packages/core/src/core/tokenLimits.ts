/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type Model = string;
type TokenCount = number;

export const DEFAULT_TOKEN_LIMIT = 1_048_576;

export function tokenLimit(model: Model): TokenCount {
  // Add other models as they become relevant or if specified by config
  // Pulled from https://ai.google.dev/gemini-api/docs/models
  switch (model) {
    // Gemini models
    case 'gemini-1.5-pro':
      return 2_097_152;
    case 'gemini-1.5-flash':
    case 'gemini-2.5-pro-preview-05-06':
    case 'gemini-2.5-pro-preview-06-05':
    case 'gemini-2.5-pro':
    case 'gemini-2.5-flash-preview-05-20':
    case 'gemini-2.5-flash':
    case 'gemini-2.0-flash':
      return 1_048_576;
    case 'gemini-2.0-flash-preview-image-generation':
      return 32_000;
    
    // Claude models on Bedrock - all have 200k context window
    case 'us.anthropic.claude-3-7-sonnet-20250219-v1:0':
    case 'us.anthropic.claude-3-5-haiku-20241022-v1:0':
    case 'us.anthropic.claude-opus-4-20250514-v1:0':
    case 'us.anthropic.claude-sonnet-4-20250514-v1:0':
    case 'us.anthropic.claude-3-5-sonnet-20241022-v2:0':
    case 'anthropic.claude-3-opus-20240229-v1:0':
    case 'anthropic.claude-3-5-sonnet-20241022-v2:0':
    case 'anthropic.claude-3-5-sonnet-20240620-v1:0':
    case 'anthropic.claude-3-sonnet-20240229-v1:0':
    case 'anthropic.claude-3-haiku-20240307-v1:0':
      return 200_000;
    
    default:
      return DEFAULT_TOKEN_LIMIT;
  }
}
