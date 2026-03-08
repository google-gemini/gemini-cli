/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logs, type LogRecord } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { isTelemetrySdkInitialized } from './sdk.js';
import {
  ClearcutLogger,
  EventNames,
} from './clearcut-logger/clearcut-logger.js';
import { EventMetadataKey } from './clearcut-logger/event-metadata-key.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type { PolicySuggestionEvent } from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

export function logPolicySuggestion(
  config: Config,
  event: PolicySuggestionEvent,
): void {
  debugLogger.debug('Policy Suggestion Event:', event);
  const clearcutLogger = ClearcutLogger.getInstance(config);
  if (clearcutLogger) {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.POLICY_SUGGESTION_TOOL_CONTEXT,
        value: safeJsonStringify(event.tool_context),
      },
      {
        gemini_cli_key: EventMetadataKey.POLICY_SUGGESTION_RESULT,
        value: safeJsonStringify(event.suggestion),
      },
    ];

    if (event.error) {
      data.push({
        gemini_cli_key: EventMetadataKey.POLICY_SUGGESTION_ERROR,
        value: event.error,
      });
    }

    clearcutLogger.enqueueLogEvent(
      clearcutLogger.createLogEvent(EventNames.POLICY_SUGGESTION, data),
    );
  }

  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}
