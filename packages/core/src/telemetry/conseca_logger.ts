/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogRecord } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import { isTelemetrySdkInitialized } from './sdk.js';
import {
  ClearcutLogger,
  EventNames,
} from './clearcut-logger/clearcut-logger.js';
import { EventMetadataKey } from './clearcut-logger/event-metadata-key.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type {
  ConsecaPolicyGenerationEvent,
  ConsecaVerdictEvent,
} from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

export function logConsecaPolicyGeneration(
  config: Config,
  event: ConsecaPolicyGenerationEvent,
): void {
  debugLogger.debug('Conseca Policy Generation Event:', event);
  const clearcutLogger = ClearcutLogger.getInstance(config);
  if (clearcutLogger) {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.CONSECA_USER_PROMPT,
        value: safeJsonStringify(event.user_prompt),
      },
      {
        gemini_cli_key: EventMetadataKey.CONSECA_TRUSTED_CONTENT,
        value: safeJsonStringify(event.trusted_content),
      },
      {
        gemini_cli_key: EventMetadataKey.CONSECA_GENERATED_POLICY,
        value: safeJsonStringify(event.policy),
      },
    ];

    if (event.error) {
      data.push({
        gemini_cli_key: EventMetadataKey.CONSECA_ERROR,
        value: event.error,
      });
    }

    clearcutLogger.enqueueLogEvent(
      clearcutLogger.createLogEvent(EventNames.CONSECA_POLICY_GENERATION, data),
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

export function logConsecaVerdict(
  config: Config,
  event: ConsecaVerdictEvent,
): void {
  debugLogger.debug('Conseca Verdict Event:', event);
  const clearcutLogger = ClearcutLogger.getInstance(config);
  if (clearcutLogger) {
    const data = [
      {
        gemini_cli_key: EventMetadataKey.CONSECA_USER_PROMPT,
        value: safeJsonStringify(event.user_prompt),
      },
      {
        gemini_cli_key: EventMetadataKey.CONSECA_GENERATED_POLICY,
        value: safeJsonStringify(event.policy),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_NAME,
        value: safeJsonStringify(event.tool_call),
      },
      {
        gemini_cli_key: EventMetadataKey.CONSECA_VERDICT_RESULT,
        value: safeJsonStringify(event.verdict),
      },
      {
        gemini_cli_key: EventMetadataKey.CONSECA_VERDICT_RATIONALE,
        value: event.verdict_rationale,
      },
    ];

    if (event.error) {
      data.push({
        gemini_cli_key: EventMetadataKey.CONSECA_ERROR,
        value: event.error,
      });
    }

    clearcutLogger.enqueueLogEvent(
      clearcutLogger.createLogEvent(EventNames.CONSECA_VERDICT, data),
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
