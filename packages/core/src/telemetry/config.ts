/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TelemetrySettings } from '../config/config.js';
import { FatalConfigError } from '../utils/errors.js';
import { TelemetryTarget } from './index.js';

/**
 * Parse a boolean environment flag. Accepts 'true'/'1' as true.
 */
export function parseBooleanEnvFlag(
  value: string | undefined,
): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true' || value === '1';
}

/**
 * Normalize a telemetry target value into TelemetryTarget or undefined.
 */
export function parseTelemetryTargetValue(
  value: string | TelemetryTarget | undefined,
): TelemetryTarget | undefined {
  if (value === undefined) return undefined;
  if (value === TelemetryTarget.LOCAL || value === 'local') {
    return TelemetryTarget.LOCAL;
  }
  if (value === TelemetryTarget.GCP || value === 'gcp') {
    return TelemetryTarget.GCP;
  }
  return undefined;
}

/**
 * Parse OTLP headers from a string value.
 * Supports JSON format or key=value pairs separated by comma or semicolon.
 * Returns Record<string, string> or undefined if parsing fails.
 */
export function parseOtlpHeaders(
  value: string | undefined,
): Record<string, string> | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const trimmedValue = value.trim();

  // Try JSON format first
  if (trimmedValue.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedValue);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        const result: Record<string, string> = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (key && val !== undefined && val !== null) {
            result[key] = String(val);
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }
    } catch {
      // It looked like JSON but failed to parse, so we assume it's invalid.
      return undefined;
    }
  }

  // Try delimiter parsing (comma or semicolon)
  if (trimmedValue.includes('=')) {
    const result: Record<string, string> = {};
    // Split by comma first, then handle semicolons
    const pairs = trimmedValue.split(/[,;]/);

    for (const pair of pairs) {
      const trimmedPair = pair.trim();
      if (!trimmedPair) continue;

      const equalsIndex = trimmedPair.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmedPair.substring(0, equalsIndex).trim();
      const val = trimmedPair.substring(equalsIndex + 1).trim();

      if (key && val) {
        result[key] = val;
      }
    }

    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  return undefined;
}

export interface TelemetryArgOverrides {
  telemetry?: boolean;
  telemetryTarget?: string | TelemetryTarget;
  telemetryOtlpEndpoint?: string;
  telemetryOtlpProtocol?: string;
  telemetryOtlpHeader?: string[];
  telemetryLogPrompts?: boolean;
  telemetryOutfile?: string;
}

/**
 * Build TelemetrySettings by resolving from argv (highest), env, then settings.
 */
export async function resolveTelemetrySettings(options: {
  argv?: TelemetryArgOverrides;
  env?: Record<string, string | undefined>;
  settings?: TelemetrySettings;
}): Promise<TelemetrySettings> {
  const argv = options.argv ?? {};
  const env = options.env ?? {};
  const settings = options.settings ?? {};

  const enabled =
    argv.telemetry ??
    parseBooleanEnvFlag(env['GEMINI_TELEMETRY_ENABLED']) ??
    settings.enabled;

  const rawTarget =
    (argv.telemetryTarget as string | TelemetryTarget | undefined) ??
    env['GEMINI_TELEMETRY_TARGET'] ??
    (settings.target as string | TelemetryTarget | undefined);
  const target = parseTelemetryTargetValue(rawTarget);
  if (rawTarget !== undefined && target === undefined) {
    throw new FatalConfigError(
      `Invalid telemetry target: ${String(
        rawTarget,
      )}. Valid values are: local, gcp`,
    );
  }

  const otlpEndpoint =
    argv.telemetryOtlpEndpoint ??
    env['GEMINI_TELEMETRY_OTLP_ENDPOINT'] ??
    env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    settings.otlpEndpoint;

  const rawProtocol =
    (argv.telemetryOtlpProtocol as string | undefined) ??
    env['GEMINI_TELEMETRY_OTLP_PROTOCOL'] ??
    settings.otlpProtocol;
  const otlpProtocol = (['grpc', 'http'] as const).find(
    (p) => p === rawProtocol,
  );
  if (rawProtocol !== undefined && otlpProtocol === undefined) {
    throw new FatalConfigError(
      `Invalid telemetry OTLP protocol: ${String(
        rawProtocol,
      )}. Valid values are: grpc, http`,
    );
  }

  const logPrompts =
    argv.telemetryLogPrompts ??
    parseBooleanEnvFlag(env['GEMINI_TELEMETRY_LOG_PROMPTS']) ??
    settings.logPrompts;

  const outfile =
    argv.telemetryOutfile ??
    env['GEMINI_TELEMETRY_OUTFILE'] ??
    settings.outfile;

  const useCollector =
    parseBooleanEnvFlag(env['GEMINI_TELEMETRY_USE_COLLECTOR']) ??
    settings.useCollector;

  // Merge OTLP headers from settings, env, and argv (in that order, later overwrites earlier)
  const otlpHeaders: Record<string, string> = {};

  // Start with settings
  if (settings.otlpHeaders) {
    Object.assign(otlpHeaders, settings.otlpHeaders);
  }

  // Merge environment variable headers
  const envHeaders = parseOtlpHeaders(env['GEMINI_TELEMETRY_OTLP_HEADERS']);
  if (envHeaders) {
    Object.assign(otlpHeaders, envHeaders);
  }

  // Merge CLI argument headers (highest precedence)
  if (argv.telemetryOtlpHeader && Array.isArray(argv.telemetryOtlpHeader)) {
    for (const headerArg of argv.telemetryOtlpHeader) {
      const parsed = parseOtlpHeaders(headerArg);
      if (parsed) {
        Object.assign(otlpHeaders, parsed);
      }
    }
  }

  return {
    enabled,
    target,
    otlpEndpoint,
    otlpProtocol,
    otlpHeaders: Object.keys(otlpHeaders).length > 0 ? otlpHeaders : undefined,
    logPrompts,
    outfile,
    useCollector,
  };
}
