/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  OutputFormat,
  JsonFormatter,
  StreamJsonFormatter,
  JsonStreamEventType,
  uiTelemetryService,
  parseAndFormatApiError,
  FatalTurnLimitedError,
  FatalCancellationError,
  FatalToolExecutionError,
  isFatalToolError,
} from '@google/gemini-cli-core';

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

interface ErrorWithCode extends Error {
  exitCode?: number;
  code?: string | number;
  status?: string | number;
}

/**
 * Extracts the appropriate error code from an error object.
 */
function extractErrorCode(error: unknown): string | number {
  const errorWithCode = error as ErrorWithCode;

  // Prioritize exitCode for FatalError types, fall back to other codes
  if (typeof errorWithCode.exitCode === 'number') {
    return errorWithCode.exitCode;
  }
  if (errorWithCode.code !== undefined) {
    return errorWithCode.code;
  }
  if (errorWithCode.status !== undefined) {
    return errorWithCode.status;
  }

  return 1; // Default exit code
}

/**
 * Converts an error code to a numeric exit code.
 */
function getNumericExitCode(errorCode: string | number): number {
  return typeof errorCode === 'number' ? errorCode : 1;
}

/**
 * Handles errors consistently for both JSON and text output formats.
 * In JSON mode, outputs formatted JSON error and exits.
 * In streaming JSON mode, emits a result event with error status.
 * In text mode, outputs error message and re-throws.
 */
export function handleError(
  error: unknown,
  config: Config,
  customErrorCode?: string | number,
): never {
  const errorMessage = parseAndFormatApiError(
    error,
    config.getContentGeneratorConfig()?.authType,
  );

  if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
    const streamFormatter = new StreamJsonFormatter();
    const errorCode = customErrorCode ?? extractErrorCode(error);
    const metrics = uiTelemetryService.getMetrics();

    streamFormatter.emitEvent({
      type: JsonStreamEventType.RESULT,
      timestamp: new Date().toISOString(),
      status: 'error',
      error: {
        type: error instanceof Error ? error.constructor.name : 'Error',
        message: errorMessage,
      },
      stats: streamFormatter.convertToStreamStats(metrics, 0),
    });

    process.exit(getNumericExitCode(errorCode));
  } else if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const errorCode = customErrorCode ?? extractErrorCode(error);

    const formattedError = formatter.formatError(
      error instanceof Error ? error : new Error(getErrorMessage(error)),
      errorCode,
    );

    console.error(formattedError);
    process.exit(getNumericExitCode(errorCode));
  } else {
    console.error(errorMessage);
    throw error;
  }
}

/**
 * Handles tool execution errors specifically.
 *
 * Fatal errors (e.g., NO_SPACE_LEFT) cause the CLI to exit immediately,
 * as they indicate unrecoverable system state.
 *
 * Non-fatal errors (e.g., INVALID_TOOL_PARAMS, FILE_NOT_FOUND, PATH_NOT_IN_WORKSPACE)
 * are logged to stderr and the error response is sent back to the model,
 * allowing it to self-correct.
 */
export function handleToolError(
  toolName: string,
  toolError: Error,
  config: Config,
  errorType?: string,
  resultDisplay?: string,
): void {
  const errorMessage = `Error executing tool ${toolName}: ${resultDisplay || toolError.message}`;

  const isFatal = isFatalToolError(errorType);

  if (isFatal) {
    const toolExecutionError = new FatalToolExecutionError(errorMessage);
    if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
      const streamFormatter = new StreamJsonFormatter();
      const metrics = uiTelemetryService.getMetrics();
      streamFormatter.emitEvent({
        type: JsonStreamEventType.RESULT,
        timestamp: new Date().toISOString(),
        status: 'error',
        error: {
          type: errorType ?? 'FatalToolExecutionError',
          message: toolExecutionError.message,
        },
        stats: streamFormatter.convertToStreamStats(metrics, 0),
      });
    } else if (config.getOutputFormat() === OutputFormat.JSON) {
      const formatter = new JsonFormatter();
      const formattedError = formatter.formatError(
        toolExecutionError,
        errorType ?? toolExecutionError.exitCode,
      );
      console.error(formattedError);
    } else {
      console.error(errorMessage);
    }
    process.exit(toolExecutionError.exitCode);
  }

  // Non-fatal: log and continue
  console.error(errorMessage);
}

/**
 * Handles cancellation/abort signals consistently.
 */
export function handleCancellationError(config: Config): never {
  const cancellationError = new FatalCancellationError('Operation cancelled.');

  if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
    const streamFormatter = new StreamJsonFormatter();
    const metrics = uiTelemetryService.getMetrics();
    streamFormatter.emitEvent({
      type: JsonStreamEventType.RESULT,
      timestamp: new Date().toISOString(),
      status: 'error',
      error: {
        type: 'FatalCancellationError',
        message: cancellationError.message,
      },
      stats: streamFormatter.convertToStreamStats(metrics, 0),
    });
    process.exit(cancellationError.exitCode);
  } else if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const formattedError = formatter.formatError(
      cancellationError,
      cancellationError.exitCode,
    );

    console.error(formattedError);
    process.exit(cancellationError.exitCode);
  } else {
    console.error(cancellationError.message);
    process.exit(cancellationError.exitCode);
  }
}

/**
 * Handles max session turns exceeded consistently.
 */
export function handleMaxTurnsExceededError(config: Config): never {
  const maxTurnsError = new FatalTurnLimitedError(
    'Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
  );

  if (config.getOutputFormat() === OutputFormat.STREAM_JSON) {
    const streamFormatter = new StreamJsonFormatter();
    const metrics = uiTelemetryService.getMetrics();
    streamFormatter.emitEvent({
      type: JsonStreamEventType.RESULT,
      timestamp: new Date().toISOString(),
      status: 'error',
      error: {
        type: 'FatalTurnLimitedError',
        message: maxTurnsError.message,
      },
      stats: streamFormatter.convertToStreamStats(metrics, 0),
    });
    process.exit(maxTurnsError.exitCode);
  } else if (config.getOutputFormat() === OutputFormat.JSON) {
    const formatter = new JsonFormatter();
    const formattedError = formatter.formatError(
      maxTurnsError,
      maxTurnsError.exitCode,
    );

    console.error(formattedError);
    process.exit(maxTurnsError.exitCode);
  } else {
    console.error(maxTurnsError.message);
    process.exit(maxTurnsError.exitCode);
  }
}
