/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export const DEFAULT_GROK_MODEL = 'grok-4-0709';
export const GROK_MODELS = ['grok-4-0709', 'grok-4'] as const;
export type GrokModel = typeof GROK_MODELS[number];
