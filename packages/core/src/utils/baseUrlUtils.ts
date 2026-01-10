/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerDetails } from '../telemetry/types.js';

export function resolveVertexServerDetails(): ServerDetails | undefined {
  if (process.env['GEMINI_CLI_VERTEX_BASE_URL'] === undefined) {
    return undefined;
  }
  return { address: process.env['GEMINI_CLI_VERTEX_BASE_URL'], port: 443 };
}
