/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseBooleanEnvFlag,
  parseOtlpHeaders,
  parseTelemetryTargetValue,
  resolveTelemetrySettings,
} from './config.js';
import { TelemetryTarget } from './index.js';

describe('telemetry/config helpers', () => {
  describe('parseBooleanEnvFlag', () => {
    it('returns undefined for undefined', () => {
      expect(parseBooleanEnvFlag(undefined)).toBeUndefined();
    });

    it('parses true values', () => {
      expect(parseBooleanEnvFlag('true')).toBe(true);
      expect(parseBooleanEnvFlag('1')).toBe(true);
    });

    it('parses false/other values as false', () => {
      expect(parseBooleanEnvFlag('false')).toBe(false);
      expect(parseBooleanEnvFlag('0')).toBe(false);
      expect(parseBooleanEnvFlag('TRUE')).toBe(false);
      expect(parseBooleanEnvFlag('random')).toBe(false);
      expect(parseBooleanEnvFlag('')).toBe(false);
    });
  });

  describe('parseTelemetryTargetValue', () => {
    it('parses string values', () => {
      expect(parseTelemetryTargetValue('local')).toBe(TelemetryTarget.LOCAL);
      expect(parseTelemetryTargetValue('gcp')).toBe(TelemetryTarget.GCP);
    });

    it('accepts enum values', () => {
      expect(parseTelemetryTargetValue(TelemetryTarget.LOCAL)).toBe(
        TelemetryTarget.LOCAL,
      );
      expect(parseTelemetryTargetValue(TelemetryTarget.GCP)).toBe(
        TelemetryTarget.GCP,
      );
    });

    it('returns undefined for unknown', () => {
      expect(parseTelemetryTargetValue('other')).toBeUndefined();
      expect(parseTelemetryTargetValue(undefined)).toBeUndefined();
    });
  });

  describe('parseOtlpHeaders', () => {
    it('returns undefined for undefined or empty string', () => {
      expect(parseOtlpHeaders(undefined)).toBeUndefined();
      expect(parseOtlpHeaders('')).toBeUndefined();
      expect(parseOtlpHeaders('   ')).toBeUndefined();
    });

    it('parses JSON object format', () => {
      const json = '{"Authorization":"Bearer token123","x-api-key":"abc"}';
      expect(parseOtlpHeaders(json)).toEqual({
        Authorization: 'Bearer token123',
        'x-api-key': 'abc',
      });
    });

    it('returns undefined for empty JSON object', () => {
      expect(parseOtlpHeaders('{}')).toBeUndefined();
    });

    it('returns undefined for malformed JSON or non-string values without falling back to key=value', () => {
      expect(parseOtlpHeaders('{Authorization=Bearer token}')).toBeUndefined();
      expect(parseOtlpHeaders('{"key": 123}')).toBeUndefined();
      expect(parseOtlpHeaders('{"key": null}')).toBeUndefined();
      expect(parseOtlpHeaders('{"key": true}')).toBeUndefined();
      expect(parseOtlpHeaders('{"valid": "yes", "bad": 42}')).toBeUndefined();
      expect(parseOtlpHeaders('["a", "b"]')).toBeUndefined();
    });

    it('parses comma-separated key=value pairs', () => {
      expect(
        parseOtlpHeaders('Authorization=Bearer token123,x-api-key=abc'),
      ).toEqual({
        Authorization: 'Bearer token123',
        'x-api-key': 'abc',
      });
    });

    it('parses semicolon-separated key=value pairs', () => {
      expect(
        parseOtlpHeaders('Authorization=Bearer token123;x-api-key=abc'),
      ).toEqual({
        Authorization: 'Bearer token123',
        'x-api-key': 'abc',
      });
    });

    it('handles values containing equals signs (e.g. base64)', () => {
      expect(parseOtlpHeaders('Authorization=Basic dXNlcjpwYXNz==')).toEqual({
        Authorization: 'Basic dXNlcjpwYXNz==',
      });
    });

    it('strips surrounding quotes from values in key=value format', () => {
      expect(
        parseOtlpHeaders('Authorization="Bearer token",x-key=\'val\''),
      ).toEqual({
        Authorization: 'Bearer token',
        'x-key': 'val',
      });
    });

    it('trims whitespace around keys and values', () => {
      expect(
        parseOtlpHeaders('  Authorization = Bearer token , x-key = val  '),
      ).toEqual({
        Authorization: 'Bearer token',
        'x-key': 'val',
      });
    });

    it('returns undefined for invalid key=value strings', () => {
      expect(parseOtlpHeaders('invalid-no-equals')).toBeUndefined();
      expect(parseOtlpHeaders('=value_without_key')).toBeUndefined();
    });

    it('rejects header names with invalid RFC 7230 characters', () => {
      expect(parseOtlpHeaders('bad name=value')).toBeUndefined();
      expect(parseOtlpHeaders('{"bad name": "value"}')).toBeUndefined();
      expect(parseOtlpHeaders('bad:name=value')).toBeUndefined();
    });

    it('rejects header values with control characters (CRLF injection)', () => {
      expect(parseOtlpHeaders('x-key=val\r\nInjected: true')).toBeUndefined();
      expect(parseOtlpHeaders('{"x-key": "val\\u0000bad"}')).toBeUndefined();
    });

    it('skips invalid pairs in key=value format and keeps valid ones', () => {
      expect(
        parseOtlpHeaders('Authorization=Bearer token,invalid,=nokey,x-ok=yes'),
      ).toEqual({
        Authorization: 'Bearer token',
        'x-ok': 'yes',
      });
    });
  });

  describe('resolveTelemetrySettings', () => {
    it('falls back to settings when no argv/env provided', async () => {
      const settings = {
        enabled: false,
        target: TelemetryTarget.LOCAL,
        otlpEndpoint: 'http://localhost:4317',
        otlpProtocol: 'grpc' as const,
        logPrompts: false,
        outfile: 'settings.log',
        useCollector: false,
      };
      const resolved = await resolveTelemetrySettings({ settings });
      expect(resolved).toEqual(settings);
    });

    it('uses env over settings and argv over env', async () => {
      const settings = {
        enabled: false,
        target: TelemetryTarget.LOCAL,
        otlpEndpoint: 'http://settings:4317',
        otlpProtocol: 'grpc' as const,
        logPrompts: false,
        outfile: 'settings.log',
        useCollector: false,
      };
      const env = {
        GEMINI_TELEMETRY_ENABLED: '1',
        GEMINI_TELEMETRY_TARGET: 'gcp',
        GEMINI_TELEMETRY_OTLP_ENDPOINT: 'http://env:4317',
        GEMINI_TELEMETRY_OTLP_PROTOCOL: 'http',
        GEMINI_TELEMETRY_LOG_PROMPTS: 'true',
        GEMINI_TELEMETRY_OUTFILE: 'env.log',
        GEMINI_TELEMETRY_USE_COLLECTOR: 'true',
      } as Record<string, string>;
      const argv = {
        telemetry: false,
        telemetryTarget: 'local',
        telemetryOtlpEndpoint: 'http://argv:4317',
        telemetryOtlpProtocol: 'grpc',
        telemetryLogPrompts: false,
        telemetryOutfile: 'argv.log',
      };

      const resolvedEnv = await resolveTelemetrySettings({ env, settings });
      expect(resolvedEnv).toEqual({
        enabled: true,
        target: TelemetryTarget.GCP,
        otlpEndpoint: 'http://env:4317',
        otlpProtocol: 'http',
        logPrompts: true,
        outfile: 'env.log',
        useCollector: true,
      });

      const resolvedArgv = await resolveTelemetrySettings({
        argv,
        env,
        settings,
      });
      expect(resolvedArgv).toEqual({
        enabled: false,
        target: TelemetryTarget.LOCAL,
        otlpEndpoint: 'http://argv:4317',
        otlpProtocol: 'grpc',
        logPrompts: false,
        outfile: 'argv.log',
        useCollector: true, // from env as no argv option
        useCliAuth: undefined,
      });
    });

    it('resolves useCliAuth from settings', async () => {
      const settings = {
        useCliAuth: true,
      };
      const resolved = await resolveTelemetrySettings({ settings });
      expect(resolved.useCliAuth).toBe(true);
    });

    it('resolves useCliAuth from env', async () => {
      const env = {
        GEMINI_TELEMETRY_USE_CLI_AUTH: 'true',
      };
      const resolved = await resolveTelemetrySettings({ env });
      expect(resolved.useCliAuth).toBe(true);
    });

    it('env overrides settings for useCliAuth', async () => {
      const settings = {
        useCliAuth: false,
      };
      const env = {
        GEMINI_TELEMETRY_USE_CLI_AUTH: 'true',
      };
      const resolved = await resolveTelemetrySettings({ env, settings });
      expect(resolved.useCliAuth).toBe(true);
    });

    it('falls back to OTEL_EXPORTER_OTLP_ENDPOINT when GEMINI var is missing', async () => {
      const settings = {};
      const env = {
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4317',
      } as Record<string, string>;
      const resolved = await resolveTelemetrySettings({ env, settings });
      expect(resolved.otlpEndpoint).toBe('http://otel:4317');
    });

    it('throws on unknown protocol values', async () => {
      const env = { GEMINI_TELEMETRY_OTLP_PROTOCOL: 'unknown' } as Record<
        string,
        string
      >;
      await expect(resolveTelemetrySettings({ env })).rejects.toThrow(
        /Invalid telemetry OTLP protocol/i,
      );
    });

    it('throws on unknown target values', async () => {
      const env = { GEMINI_TELEMETRY_TARGET: 'unknown' } as Record<
        string,
        string
      >;
      await expect(resolveTelemetrySettings({ env })).rejects.toThrow(
        /Invalid telemetry target/i,
      );
    });

    it('resolves otlpHeaders from settings', async () => {
      const settings = {
        otlpHeaders: { Authorization: 'Bearer settings-token' },
      };
      const resolved = await resolveTelemetrySettings({ settings });
      expect(resolved.otlpHeaders).toEqual({
        Authorization: 'Bearer settings-token',
      });
    });

    it('resolves otlpHeaders from GEMINI_TELEMETRY_OTLP_HEADERS and OTEL_EXPORTER_OTLP_HEADERS', async () => {
      const resolvedOtel = await resolveTelemetrySettings({
        env: { OTEL_EXPORTER_OTLP_HEADERS: 'x-otel=1,Authorization=Bearer a' },
      });
      expect(resolvedOtel.otlpHeaders).toEqual({
        'x-otel': '1',
        Authorization: 'Bearer a',
      });

      const resolvedGemini = await resolveTelemetrySettings({
        env: {
          OTEL_EXPORTER_OTLP_HEADERS: 'x-otel=1,Authorization=Bearer a',
          GEMINI_TELEMETRY_OTLP_HEADERS: '{"Authorization":"Bearer b"}',
        },
      });
      expect(resolvedGemini.otlpHeaders).toEqual({
        'x-otel': '1',
        Authorization: 'Bearer b',
      });
    });

    it('merges otlpHeaders across settings, env, and argv with case-insensitive deduplication', async () => {
      const settings = {
        otlpHeaders: {
          Authorization: 'Bearer settings',
          'X-Settings': 'from-settings',
        },
      };
      const env = {
        GEMINI_TELEMETRY_OTLP_HEADERS:
          'authorization=Bearer env,X-Env=from-env',
      };
      const argv = {
        telemetryOtlpHeaders: 'X-Argv=from-argv',
      };
      const resolved = await resolveTelemetrySettings({ argv, env, settings });
      expect(resolved.otlpHeaders).toEqual({
        'X-Settings': 'from-settings',
        authorization: 'Bearer env',
        'X-Env': 'from-env',
        'X-Argv': 'from-argv',
      });
    });

    it('throws FatalConfigError on invalid otlpHeaders in env or argv', async () => {
      await expect(
        resolveTelemetrySettings({
          env: { GEMINI_TELEMETRY_OTLP_HEADERS: 'invalid-headers' },
        }),
      ).rejects.toThrow(/Invalid telemetry OTLP headers/i);

      await expect(
        resolveTelemetrySettings({
          env: { OTEL_EXPORTER_OTLP_HEADERS: '{bad json}' },
        }),
      ).rejects.toThrow(/Invalid telemetry OTLP headers/i);

      await expect(
        resolveTelemetrySettings({
          argv: { telemetryOtlpHeaders: 'invalid-headers' },
        }),
      ).rejects.toThrow(/Invalid telemetry OTLP headers/i);
    });
  });
});
