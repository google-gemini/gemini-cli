/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

declare module 'safe-regex' {
  function safeRegex(regex: string, options?: { limit?: number }): boolean;
  export = safeRegex;
}
