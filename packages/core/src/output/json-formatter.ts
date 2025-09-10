/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import type { SessionMetrics } from '../telemetry/uiTelemetry.js';
import type { JsonError, JsonOutput } from './types.js';

export class JsonFormatter {
  format(response?: string, stats?: SessionMetrics, error?: JsonError): string {
    const output: JsonOutput = {};

    if (response !== undefined) {
      output.response = stripAnsi(response);
    }

    if (stats) {
      output.stats = stats;
    }

    if (error) {
      output.error = error;
    }

    return JSON.stringify(output, null, 2);
  }

  formatError(error: Error, code?: string | number): string {
    const jsonError: JsonError = {
      type: error.constructor.name,
      message: stripAnsi(error.message),
      ...(code && { code }),
    };

    return this.format(undefined, undefined, jsonError);
  }
}
