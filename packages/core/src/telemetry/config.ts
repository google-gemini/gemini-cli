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

  return {
    enabled,
    target,
    otlpEndpoint,
    otlpProtocol,
    logPrompts,
    outfile,
    useCollector,
  };
}
