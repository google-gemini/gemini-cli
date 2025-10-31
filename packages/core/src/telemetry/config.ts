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

interface ParserState {
  readonly inQuotes: boolean;
  readonly quoteChar: string;
  readonly escaped: boolean;
}

const createInitialState = (): ParserState => ({
  inQuotes: false,
  quoteChar: '',
  escaped: false,
});

function updateParserState(state: ParserState, char: string): ParserState {
  if (state.escaped) {
    return { ...state, escaped: false };
  }

  if (char === '\\') {
    return { ...state, escaped: true };
  }

  if ((char === '"' || char === "'") && !state.inQuotes) {
    return { inQuotes: true, quoteChar: char, escaped: false };
  }

  if (char === state.quoteChar && state.inQuotes) {
    return { inQuotes: false, quoteChar: '', escaped: false };
  }

  return state;
}

const isUnquotedDelimiter = (char: string, state: ParserState): boolean =>
  !state.inQuotes && (char === ',' || char === ';');

const isUnquotedEquals = (char: string, state: ParserState): boolean =>
  !state.inQuotes && char === '=';

// Reasonable limits to prevent accidental misuse and protect OTLP backends
const MAX_HEADER_VALUE_LENGTH = 8192; // 8KB per header value
const MAX_HEADER_COUNT = 100; // Most backends limit total header size anyway

const isValidHeaderName = (name: string): boolean => {
  if (!name || name.length === 0) {
    return false;
  }
  // RFC 7230: Valid header name characters
  return /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(name);
};

const isValidHeaderValue = (value: string): boolean => {
  if (value.length > MAX_HEADER_VALUE_LENGTH) {
    return false;
  }
  // RFC 7230: No control characters except tab
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000A-\u001F\u007F]/u.test(value);
};

const unquote = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
};

function splitByDelimitersRespectingQuotes(input: string): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let state = createInitialState();

  for (const char of input) {
    state = updateParserState(state, char);

    if (isUnquotedDelimiter(char, state)) {
      const trimmed = currentPart.trim();
      if (trimmed) {
        parts.push(trimmed);
      }
      currentPart = '';
    } else {
      currentPart += char;
    }
  }

  if (state.inQuotes) {
    throw new Error(
      `Unclosed quote in header value. Expected closing ${state.quoteChar}`,
    );
  }

  const trimmed = currentPart.trim();
  if (trimmed) {
    parts.push(trimmed);
  }

  return parts;
}

function parseKeyValuePair(
  pair: string,
): { key: string; value: string } | null {
  const equalsIndex = pair.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }

  const key = pair.substring(0, equalsIndex).trim();
  const rawValue = pair.substring(equalsIndex + 1).trim();

  if (!isValidHeaderName(key)) {
    return null;
  }

  if (
    (rawValue.startsWith('"') && !rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && !rawValue.endsWith("'"))
  ) {
    throw new Error('Unclosed quote in header value');
  }

  const value = unquote(rawValue);

  if (!key || !value || !isValidHeaderValue(value)) {
    return null;
  }

  return { key, value };
}

function countUnquotedEquals(input: string): number {
  let state = createInitialState();
  let count = 0;

  for (const char of input) {
    state = updateParserState(state, char);
    if (isUnquotedEquals(char, state)) {
      count++;
    }
  }

  return count;
}

/**
 * Parse OTLP headers from a string value.
 * Supports JSON format or key=value pairs separated by comma/semicolon.
 * Validates per RFC 7230 and enforces reasonable limits to prevent
 * accidental misuse and protect OTLP backends.
 */
export function parseOtlpHeaders(
  value: string | undefined,
): Record<string, string> | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const trimmedValue = value.trim();

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
          if (!key || val === undefined || val === null) {
            continue;
          }
          const stringVal = String(val);
          if (isValidHeaderName(key) && isValidHeaderValue(stringVal)) {
            result[key] = stringVal;
            if (Object.keys(result).length > MAX_HEADER_COUNT) {
              return undefined;
            }
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      }
    } catch {
      return undefined;
    }
  }

  if (trimmedValue.includes('=')) {
    try {
      const result: Record<string, string> = {};
      const equalsCount = countUnquotedEquals(trimmedValue);

      if (equalsCount === 1) {
        const parsed = parseKeyValuePair(trimmedValue);
        if (parsed) {
          result[parsed.key] = parsed.value;
        }
      } else {
        const pairs = splitByDelimitersRespectingQuotes(trimmedValue);

        for (const pair of pairs) {
          const parsed = parseKeyValuePair(pair);
          if (parsed) {
            result[parsed.key] = parsed.value;
            if (Object.keys(result).length > MAX_HEADER_COUNT) {
              return undefined;
            }
          }
        }
      }

      if (Object.keys(result).length > 0) {
        return result;
      }
    } catch (_error) {
      return undefined;
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
