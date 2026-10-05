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

export interface TelemetryArgOverrides {
  telemetry?: boolean;
  telemetryTarget?: string | TelemetryTarget;
  telemetryOtlpEndpoint?: string;
  telemetryOtlpProtocol?: string;
  telemetryOtlpHeaders?: string | Record<string, string>;
  telemetryLogPrompts?: boolean;
  telemetryOutfile?: string;
}

const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isValidHeaderName(name: string): boolean {
  return HEADER_NAME_REGEX.test(name);
}

function isValidHeaderValue(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
      return false;
    }
  }
  return true;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

const ALLOWED_TELEMETRY_ENV_KEYS = new Set([
  'GEMINI_TELEMETRY_ENABLED',
  'GEMINI_TELEMETRY_TRACES_ENABLED',
  'GEMINI_TELEMETRY_TARGET',
  'GEMINI_TELEMETRY_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'GEMINI_TELEMETRY_OTLP_PROTOCOL',
  'GEMINI_TELEMETRY_OTLP_HEADERS',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'GEMINI_TELEMETRY_LOG_PROMPTS',
  'GEMINI_TELEMETRY_OUTFILE',
  'GEMINI_TELEMETRY_USE_COLLECTOR',
  'GEMINI_TELEMETRY_USE_CLI_AUTH',
]);

function setHeaderCaseInsensitive(
  headers: Record<string, string>,
  lowerKeyMap: Map<string, string>,
  key: string,
  value: string,
): void {
  const lowerKey = key.toLowerCase();
  const existingKey = lowerKeyMap.get(lowerKey);
  if (existingKey !== undefined && existingKey !== key) {
    delete headers[existingKey];
  }
  headers[key] = value;
  lowerKeyMap.set(lowerKey, key);
}

function validateHeadersObject(
  headers: object,
): Record<string, string> | undefined {
  const validated: Record<string, string> = {};
  const lowerKeyMap = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) {
    const trimmedKey = k.trim();
    if (
      typeof v !== 'string' ||
      !trimmedKey ||
      !isValidHeaderName(trimmedKey) ||
      !isValidHeaderValue(v)
    ) {
      return undefined;
    }
    setHeaderCaseInsensitive(validated, lowerKeyMap, trimmedKey, v);
  }
  return validated;
}

/**
 * Parse OTLP headers from a string.
 * Supports JSON object format (e.g., '{"Authorization":"Bearer token"}') or
 * key=value pairs separated by commas (e.g., 'Authorization=Bearer token,x-api-key=abc123').
 */
export function parseOtlpHeaders(
  value: string | undefined,
): Record<string, string> | undefined {
  if (!value || value.trim() === '') return undefined;

  const trimmed = value.trim();

  // If the string starts with '{', treat it strictly as JSON and do not fall through to key=value parsing.
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        const validated = validateHeadersObject(parsed);
        if (!validated || Object.keys(validated).length === 0) {
          return undefined;
        }
        return validated;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // Reject other JSON literals like arrays
  if (trimmed.startsWith('[')) {
    return undefined;
  }

  // Parse as key=value pairs separated by commas
  const headers: Record<string, string> = {};
  const lowerKeyMap = new Map<string, string>();
  const pairs = trimmed.split(',');
  for (const pair of pairs) {
    const trimmedPair = pair.trim();
    if (!trimmedPair) continue;
    const eqIndex = trimmedPair.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmedPair.slice(0, eqIndex).trim();
    const val = stripQuotes(trimmedPair.slice(eqIndex + 1).trim());
    if (key && isValidHeaderName(key) && isValidHeaderValue(val)) {
      setHeaderCaseInsensitive(headers, lowerKeyMap, key, val);
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Merge header objects from lowest to highest precedence, deduplicating keys case-insensitively.
 */
function mergeHeaders(
  ...sources: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const definedSources = sources.filter(
    (s): s is Record<string, string> => s !== undefined,
  );
  if (definedSources.length === 0) {
    return undefined;
  }

  const merged: Record<string, string> = {};
  const lowerKeyMap = new Map<string, string>();
  for (const source of definedSources) {
    for (const [key, value] of Object.entries(source)) {
      setHeaderCaseInsensitive(merged, lowerKeyMap, key, value);
    }
  }
  return merged;
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
  const sanitizedEnv = Object.fromEntries(
    Object.entries(options.env ?? {}).filter(([key]) =>
      ALLOWED_TELEMETRY_ENV_KEYS.has(key),
    ),
  );
  const settings = options.settings ?? {};

  const enabled =
    argv.telemetry ??
    parseBooleanEnvFlag(sanitizedEnv['GEMINI_TELEMETRY_ENABLED']) ??
    settings.enabled;

  const traces =
    parseBooleanEnvFlag(sanitizedEnv['GEMINI_TELEMETRY_TRACES_ENABLED']) ??
    settings.traces;

  const rawTarget =
    argv.telemetryTarget ??
    sanitizedEnv['GEMINI_TELEMETRY_TARGET'] ??
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
    sanitizedEnv['GEMINI_TELEMETRY_OTLP_ENDPOINT'] ??
    sanitizedEnv['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
    settings.otlpEndpoint;

  const rawProtocol =
    argv.telemetryOtlpProtocol ??
    sanitizedEnv['GEMINI_TELEMETRY_OTLP_PROTOCOL'] ??
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
    parseBooleanEnvFlag(sanitizedEnv['GEMINI_TELEMETRY_LOG_PROMPTS']) ??
    settings.logPrompts;

  const outfile =
    argv.telemetryOutfile ??
    sanitizedEnv['GEMINI_TELEMETRY_OUTFILE'] ??
    settings.outfile;

  const useCollector =
    parseBooleanEnvFlag(sanitizedEnv['GEMINI_TELEMETRY_USE_COLLECTOR']) ??
    settings.useCollector;

  // Resolve OTLP headers: merge settings (lowest), OTEL_EXPORTER_OTLP_HEADERS,
  // GEMINI_TELEMETRY_OTLP_HEADERS, and argv (highest).
  let settingsHeaders: Record<string, string> | undefined;
  if (settings.otlpHeaders !== undefined) {
    settingsHeaders = validateHeadersObject(settings.otlpHeaders);
    if (settingsHeaders === undefined) {
      throw new FatalConfigError(
        'Invalid telemetry OTLP headers in settings: header names and values must be valid HTTP header tokens.',
      );
    }
  }

  const rawOtelEnvHeaders = sanitizedEnv['OTEL_EXPORTER_OTLP_HEADERS'];
  let otelEnvHeaders: Record<string, string> | undefined;
  if (rawOtelEnvHeaders !== undefined && rawOtelEnvHeaders.trim() !== '') {
    otelEnvHeaders = parseOtlpHeaders(rawOtelEnvHeaders);
    if (otelEnvHeaders === undefined) {
      throw new FatalConfigError(
        `Invalid telemetry OTLP headers: ${rawOtelEnvHeaders}. Expected JSON object or key=value pairs`,
      );
    }
  }

  const rawGeminiEnvHeaders = sanitizedEnv['GEMINI_TELEMETRY_OTLP_HEADERS'];
  let geminiEnvHeaders: Record<string, string> | undefined;
  if (rawGeminiEnvHeaders !== undefined && rawGeminiEnvHeaders.trim() !== '') {
    geminiEnvHeaders = parseOtlpHeaders(rawGeminiEnvHeaders);
    if (geminiEnvHeaders === undefined) {
      throw new FatalConfigError(
        `Invalid telemetry OTLP headers: ${rawGeminiEnvHeaders}. Expected JSON object or key=value pairs`,
      );
    }
  }

  let argvHeaders: Record<string, string> | undefined;
  if (argv.telemetryOtlpHeaders !== undefined) {
    if (typeof argv.telemetryOtlpHeaders === 'string') {
      if (argv.telemetryOtlpHeaders.trim() !== '') {
        argvHeaders = parseOtlpHeaders(argv.telemetryOtlpHeaders);
        if (argvHeaders === undefined) {
          throw new FatalConfigError(
            `Invalid telemetry OTLP headers: ${argv.telemetryOtlpHeaders}. Expected JSON object or key=value pairs`,
          );
        }
      }
    } else {
      argvHeaders = validateHeadersObject(argv.telemetryOtlpHeaders);
      if (argvHeaders === undefined) {
        throw new FatalConfigError(
          'Invalid telemetry OTLP headers in argv: header names and values must be valid HTTP header tokens.',
        );
      }
    }
  }

  const otlpHeaders = mergeHeaders(
    settingsHeaders,
    otelEnvHeaders,
    geminiEnvHeaders,
    argvHeaders,
  );

  return {
    enabled,
    traces,
    target,
    otlpEndpoint,
    otlpProtocol,
    otlpHeaders,
    logPrompts,
    outfile,
    useCollector,
    useCliAuth:
      parseBooleanEnvFlag(sanitizedEnv['GEMINI_TELEMETRY_USE_CLI_AUTH']) ??
      settings.useCliAuth,
  };
}
