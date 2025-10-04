/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authentication types and user tier enums.
 *
 * This module was extracted to break circular dependencies between
 * core/contentGenerator.ts and code_assist/types.ts. It has no
 * dependencies and can be safely imported from anywhere.
 *
 * Verified circular-dependency-free via madge.
 */

/**
 * Authentication type for Gemini Code Assist
 */
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
}

/**
 * User tier classification for quota and rate limiting
 */
export enum UserTierId {
  FREE = 'free-tier',
  LEGACY = 'legacy-tier',
  STANDARD = 'standard-tier',
}
