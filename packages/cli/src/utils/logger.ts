/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Minimal logger type for modules that accept an injected logger.
// This keeps imports light and avoids coupling to a specific impl.
export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  debug?(message: string, meta?: unknown): void;
}

