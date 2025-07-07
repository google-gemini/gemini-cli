/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated This file is deprecated. Custom content generators have been moved to the adapters module.
 * Import from '../adapters' instead. This file will be removed in a future version.
 */

// Re-export from adapters for 100% backward compatibility
export { OpenAICompatibleContentGenerator } from '../adapters/openaiCompatibleContentGenerator.js';
export { AnthropicContentGenerator } from '../adapters/anthropicContentGenerator.js';
export { AzureContentGenerator } from '../adapters/azureContentGenerator.js';