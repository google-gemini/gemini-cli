/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionMetrics } from '../telemetry/uiTelemetry.js';

export enum OutputFormat {
  TEXT = 'text',
  JSON = 'json',
}

export interface JsonError {
  type: string;
  message: string;
  code?: string | number;
}

export interface JsonOutput {
  response?: string;
  stats?: SessionMetrics;
  error?: JsonError;
}
