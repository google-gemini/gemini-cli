/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseBooleanEnvFlag,
  parseTelemetryTargetValue,
  resolveTelemetrySettings,
  parseOtlpHeaders,
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
      });
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
  });

  describe('parseOtlpHeaders', () => {
    it('returns undefined for empty or undefined values', async () => {
      expect(parseOtlpHeaders(undefined)).toBeUndefined();
      expect(parseOtlpHeaders('')).toBeUndefined();
      expect(parseOtlpHeaders('   ')).toBeUndefined();
    });

    it('parses JSON format', async () => {
      const result = parseOtlpHeaders(
        '{"Authorization":"Bearer token","x-api-key":"abc123"}',
      );
      expect(result).toEqual({
        Authorization: 'Bearer token',
        'x-api-key': 'abc123',
      });
    });

    it('parses comma-delimited key=value pairs', async () => {
      const result = parseOtlpHeaders(
        'Authorization=Bearer token,x-api-key=abc123',
      );
      expect(result).toEqual({
        Authorization: 'Bearer token',
        'x-api-key': 'abc123',
      });
    });

    it('parses semicolon-delimited key=value pairs', async () => {
      const result = parseOtlpHeaders(
        'Authorization=Bearer token; x-api-key=abc123',
      );
      expect(result).toEqual({
        Authorization: 'Bearer token',
        'x-api-key': 'abc123',
      });
    });

    it('ignores malformed pairs', async () => {
      const result = parseOtlpHeaders('Good=Yes,BadPair,Another=Ok');
      expect(result).toEqual({
        Good: 'Yes',
        Another: 'Ok',
      });
    });

    it('ignores empty keys or values', async () => {
      const result = parseOtlpHeaders('=value,key=,valid=yes');
      expect(result).toEqual({
        valid: 'yes',
      });
    });

    it('handles whitespace in key=value format', async () => {
      const result = parseOtlpHeaders('  key1 = value1  ,  key2=value2  ');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('returns undefined for invalid JSON', async () => {
      const result = parseOtlpHeaders('{invalid json}');
      expect(result).toBeUndefined();
    });
  });

  describe('resolveTelemetrySettings with headers', () => {
    it('merges headers from settings, env, and argv with correct precedence', async () => {
      const settings = {
        otlpHeaders: {
          header1: 'from-settings',
          header2: 'from-settings',
        },
      };
      const env = {
        GEMINI_TELEMETRY_OTLP_HEADERS:
          '{"header2":"from-env","header3":"from-env"}',
      } as Record<string, string>;
      const argv = {
        telemetryOtlpHeader: ['header3=from-argv', 'header4=from-argv'],
      };

      const resolved = await resolveTelemetrySettings({ argv, env, settings });
      expect(resolved.otlpHeaders).toEqual({
        header1: 'from-settings',
        header2: 'from-env',
        header3: 'from-argv',
        header4: 'from-argv',
      });
    });

    it('returns undefined otlpHeaders when none are provided', async () => {
      const resolved = await resolveTelemetrySettings({});
      expect(resolved.otlpHeaders).toBeUndefined();
    });

    it('handles headers from settings only', async () => {
      const settings = {
        otlpHeaders: {
          Authorization: 'Bearer token',
        },
      };
      const resolved = await resolveTelemetrySettings({ settings });
      expect(resolved.otlpHeaders).toEqual({
        Authorization: 'Bearer token',
      });
    });

    it('handles headers from env only with JSON format', async () => {
      const env = {
        GEMINI_TELEMETRY_OTLP_HEADERS: '{"x-api-key":"abc123"}',
      } as Record<string, string>;
      const resolved = await resolveTelemetrySettings({ env });
      expect(resolved.otlpHeaders).toEqual({
        'x-api-key': 'abc123',
      });
    });

    it('handles headers from env only with comma-delimited format', async () => {
      const env = {
        GEMINI_TELEMETRY_OTLP_HEADERS: 'Authorization=Bearer XYZ,x-api-key=abc',
      } as Record<string, string>;
      const resolved = await resolveTelemetrySettings({ env });
      expect(resolved.otlpHeaders).toEqual({
        Authorization: 'Bearer XYZ',
        'x-api-key': 'abc',
      });
    });

    it('handles headers from argv only', async () => {
      const argv = {
        telemetryOtlpHeader: ['Authorization=Bearer token'],
      };
      const resolved = await resolveTelemetrySettings({ argv });
      expect(resolved.otlpHeaders).toEqual({
        Authorization: 'Bearer token',
      });
    });
  });
});
