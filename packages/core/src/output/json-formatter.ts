/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';
import type { SessionMetrics } from '../telemetry/uiTelemetry.js';
import type { JsonError, JsonOutput, JsonOutputStats } from './types.js';

type JsonFormatDiagnostics = {
  includeDiagnostics?: boolean;
  retryCount?: number;
  loopDetected?: boolean;
  loopType?: string;
};

export class JsonFormatter {
  format(
    sessionId?: string,
    response?: string,
    stats?: SessionMetrics,
    error?: JsonError,
    authMethod?: string,
    userTier?: string,
    diagnostics?: JsonFormatDiagnostics,
  ): string {
    const output: JsonOutput = {};

    if (sessionId) {
      output.session_id = sessionId;
    }

    if (authMethod) {
      output.auth_method = authMethod;
    }

    if (userTier) {
      output.user_tier = userTier;
    }

    if (response !== undefined) {
      output.response = stripAnsi(response);
    }

    if (stats) {
      const outputStats: JsonOutputStats = { ...stats };
      if (diagnostics?.includeDiagnostics) {
        let apiRequests = 0;
        let apiErrors = 0;
        for (const modelMetrics of Object.values(stats.models)) {
          apiRequests += modelMetrics.api.totalRequests;
          apiErrors += modelMetrics.api.totalErrors;
        }

        outputStats.api_requests = apiRequests;
        outputStats.api_errors = apiErrors;
        outputStats.retry_count = diagnostics.retryCount ?? 0;

        if (diagnostics.loopDetected) {
          outputStats.loop_detected = true;
        }

        if (diagnostics.loopType) {
          outputStats.loop_type = diagnostics.loopType;
        }
      }
      output.stats = outputStats;
    }

    if (error) {
      output.error = error;
    }

    return JSON.stringify(output, null, 2);
  }

  formatError(
    error: Error,
    code?: string | number,
    sessionId?: string,
  ): string {
    const jsonError: JsonError = {
      type: error.constructor.name,
      message: stripAnsi(error.message),
      ...(code && { code }),
    };

    return this.format(sessionId, undefined, undefined, jsonError);
  }
}
