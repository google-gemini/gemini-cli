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

    it('handles single key=value pair with comma in value (unquoted)', async () => {
      const result = parseOtlpHeaders('Accept=text/html,application/xhtml+xml');
      expect(result).toEqual({
        Accept: 'text/html,application/xhtml+xml',
      });
    });

    it('handles quoted values with commas using double quotes', async () => {
      const result = parseOtlpHeaders(
        'Accept="text/html,application/xhtml+xml",Authorization=Bearer token',
      );
      expect(result).toEqual({
        Accept: 'text/html,application/xhtml+xml',
        Authorization: 'Bearer token',
      });
    });

    it('handles quoted values with commas using single quotes', async () => {
      const result = parseOtlpHeaders(
        "Accept='text/html,application/xhtml+xml',Authorization=Bearer token",
      );
      expect(result).toEqual({
        Accept: 'text/html,application/xhtml+xml',
        Authorization: 'Bearer token',
      });
    });

    it('handles quoted values with semicolons', async () => {
      const result = parseOtlpHeaders(
        'Cache-Control="max-age=3600; must-revalidate",Authorization=Bearer token',
      );
      expect(result).toEqual({
        'Cache-Control': 'max-age=3600; must-revalidate',
        Authorization: 'Bearer token',
      });
    });

    it('handles multiple quoted values', async () => {
      const result = parseOtlpHeaders(
        'Accept="text/html,application/json",Cache-Control="no-cache, no-store",Authorization=Bearer token',
      );
      expect(result).toEqual({
        Accept: 'text/html,application/json',
        'Cache-Control': 'no-cache, no-store',
        Authorization: 'Bearer token',
      });
    });

    it('handles mixed quoted and unquoted values', async () => {
      const result = parseOtlpHeaders(
        'key1=simple,key2="complex, value",key3=another',
      );
      expect(result).toEqual({
        key1: 'simple',
        key2: 'complex, value',
        key3: 'another',
      });
    });

    it('handles values with both commas and semicolons in quotes', async () => {
      const result = parseOtlpHeaders('Complex="value,with;both",Simple=plain');
      expect(result).toEqual({
        Complex: 'value,with;both',
        Simple: 'plain',
      });
    });

    it('handles trailing commas', async () => {
      const result = parseOtlpHeaders('key1=value1,key2=value2,');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('handles leading commas', async () => {
      const result = parseOtlpHeaders(',key1=value1,key2=value2');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('handles consecutive delimiters', async () => {
      const result = parseOtlpHeaders('key1=value1,,key2=value2;;key3=value3');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });

    it('handles values with equals signs in quotes', async () => {
      const result = parseOtlpHeaders('Math="x=y+z",key2=value2');
      expect(result).toEqual({
        Math: 'x=y+z',
        key2: 'value2',
      });
    });

    it('handles empty quoted values', async () => {
      const result = parseOtlpHeaders('key1="",key2=value2');
      expect(result).toEqual({
        key2: 'value2',
      });
    });

    it('handles whitespace around quoted values', async () => {
      const result = parseOtlpHeaders('  key1 = "value1" , key2="value2"  ');
      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('handles real-world Accept header example with quotes', async () => {
      const result = parseOtlpHeaders(
        'Accept="text/html,application/xhtml+xml,application/xml;q=0.9"',
      );
      expect(result).toEqual({
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
      });
    });

    it('handles real-world Cache-Control header example with quotes', async () => {
      const result = parseOtlpHeaders(
        'Cache-Control="public, max-age=31536000, immutable"',
      );
      expect(result).toEqual({
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
    });

    it('handles simple Accept header without quotes', async () => {
      const result = parseOtlpHeaders('Accept=application/json');
      expect(result).toEqual({
        Accept: 'application/json',
      });
    });

    it('handles Authorization header without quotes', async () => {
      const result = parseOtlpHeaders('Authorization=Bearer token123');
      expect(result).toEqual({
        Authorization: 'Bearer token123',
      });
    });

    // Security and validation tests

    it('rejects header names with invalid characters', async () => {
      expect(parseOtlpHeaders('Bad Header=value')).toBeUndefined(); // space
      expect(parseOtlpHeaders('Bad:Header=value')).toBeUndefined(); // colon
      expect(parseOtlpHeaders('Bad(Header)=value')).toBeUndefined(); // parens
      expect(parseOtlpHeaders('Bad<Header>=value')).toBeUndefined(); // angle brackets
    });

    it('accepts valid header names with allowed special characters', async () => {
      const result = parseOtlpHeaders(
        'X-Custom-Header=value,X-API_Key=abc,Content-Type=json',
      );
      expect(result).toEqual({
        'X-Custom-Header': 'value',
        'X-API_Key': 'abc',
        'Content-Type': 'json',
      });
    });

    it('rejects header values with control characters', async () => {
      expect(parseOtlpHeaders('Header=value\nwith\nnewlines')).toBeUndefined();
      expect(parseOtlpHeaders('Header=value\rwith\rcarriage')).toBeUndefined();
      expect(parseOtlpHeaders('Header=value\x00null')).toBeUndefined();
    });

    it('allows tabs in header values', async () => {
      const result = parseOtlpHeaders('Header=value\twith\ttabs');
      expect(result).toEqual({
        Header: 'value\twith\ttabs',
      });
    });

    it('rejects values exceeding maximum length', async () => {
      const longValue = 'x'.repeat(9000);
      const result = parseOtlpHeaders(`Header=${longValue}`);
      expect(result).toBeUndefined();
    });

    it('accepts values at maximum length', async () => {
      const maxValue = 'x'.repeat(8192);
      const result = parseOtlpHeaders(`Header=${maxValue}`);
      expect(result).toEqual({
        Header: maxValue,
      });
    });

    it('rejects unclosed double quotes', async () => {
      expect(parseOtlpHeaders('Header="unclosed')).toBeUndefined();
      expect(
        parseOtlpHeaders('Header1="closed",Header2="unclosed'),
      ).toBeUndefined();
    });

    it('rejects unclosed single quotes', async () => {
      expect(parseOtlpHeaders("Header='unclosed")).toBeUndefined();
      expect(
        parseOtlpHeaders("Header1='closed',Header2='unclosed"),
      ).toBeUndefined();
    });

    it('handles escaped quotes within quoted values', async () => {
      const result = parseOtlpHeaders('Message="He said \\"hello\\""');
      expect(result).toEqual({
        Message: 'He said "hello"',
      });
    });

    it('handles escaped backslashes', async () => {
      const result = parseOtlpHeaders('Path="C:\\\\Program Files\\\\app"');
      expect(result).toEqual({
        Path: 'C:\\Program Files\\app',
      });
    });

    it('handles mixed escape sequences', async () => {
      const result = parseOtlpHeaders(
        'Complex="quotes\\"and\\\\backslashes\\\\and,commas"',
      );
      expect(result).toEqual({
        Complex: 'quotes"and\\backslashes\\and,commas',
      });
    });

    it('enforces maximum header count', async () => {
      // Create 101 headers (exceeds limit of 100)
      const headers = Array.from(
        { length: 101 },
        (_, i) => `Header${i}=value${i}`,
      ).join(',');
      const result = parseOtlpHeaders(headers);
      expect(result).toBeUndefined();
    });

    it('accepts maximum header count', async () => {
      // Create exactly 100 headers (at the limit)
      const headers = Array.from(
        { length: 100 },
        (_, i) => `Header${i}=value${i}`,
      ).join(',');
      const result = parseOtlpHeaders(headers);
      expect(result).toBeDefined();
      expect(Object.keys(result ?? {}).length).toBe(100);
    });

    it('validates JSON header names and values', async () => {
      const result = parseOtlpHeaders(
        '{"Valid-Header":"value","Bad Header":"value2"}',
      );
      // Should only include the valid header
      expect(result).toEqual({
        'Valid-Header': 'value',
      });
    });

    it('rejects JSON with control characters in values', async () => {
      const result = parseOtlpHeaders('{"Header":"value\\nwith\\nnewlines"}');
      expect(result).toBeUndefined();
    });

    it('handles empty header name', async () => {
      expect(parseOtlpHeaders('=value')).toBeUndefined();
      expect(parseOtlpHeaders('  =value')).toBeUndefined();
    });

    it('handles empty header value after unquoting', async () => {
      expect(parseOtlpHeaders('Header=""')).toBeUndefined();
      expect(parseOtlpHeaders("Header=''")).toBeUndefined();
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
