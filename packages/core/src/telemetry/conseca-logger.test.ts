/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logs, type Logger } from '@opentelemetry/api-logs';
import {
  logConsecaPolicyGeneration,
  logConsecaVerdict,
} from './conseca-logger.js';
import {
  ConsecaPolicyGenerationEvent,
  ConsecaVerdictEvent,
  EVENT_CONSECA_POLICY_GENERATION,
  EVENT_CONSECA_VERDICT,
} from './types.js';
import type { Config } from '../config/config.js';
import * as sdk from './sdk.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import { EventMetadataKey } from './clearcut-logger/event-metadata-key.js';

vi.mock('@opentelemetry/api-logs');
vi.mock('./sdk.js');
vi.mock('./clearcut-logger/clearcut-logger.js');

describe('conseca-logger', () => {
  let mockConfig: Config;
  let mockLogger: { emit: ReturnType<typeof vi.fn> };
  let mockClearcutLogger: {
    enqueueLogEvent: ReturnType<typeof vi.fn>;
    createLogEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConfig = {
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(true),
      getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
    } as unknown as Config;

    mockLogger = {
      emit: vi.fn(),
    };
    vi.mocked(logs.getLogger).mockReturnValue(mockLogger as unknown as Logger);
    vi.mocked(sdk.isTelemetrySdkInitialized).mockReturnValue(true);

    mockClearcutLogger = {
      enqueueLogEvent: vi.fn(),
      createLogEvent: vi.fn().mockReturnValue({ event_name: 'test' }),
    };
    vi.mocked(ClearcutLogger.getInstance).mockReturnValue(
      mockClearcutLogger as unknown as ClearcutLogger,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should log policy generation event to OTEL and Clearcut', () => {
    const event = new ConsecaPolicyGenerationEvent(
      'user prompt',
      'trusted content',
      'generated policy',
    );

    logConsecaPolicyGeneration(mockConfig, event);

    // Verify OTEL
    expect(logs.getLogger).toHaveBeenCalled();
    expect(mockLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Conseca Policy Generation.',
        attributes: expect.objectContaining({
          'event.name': EVENT_CONSECA_POLICY_GENERATION,
        }),
      }),
    );

    // Verify Clearcut
    expect(ClearcutLogger.getInstance).toHaveBeenCalledWith(mockConfig);
    expect(mockClearcutLogger.createLogEvent).toHaveBeenCalled();
    expect(mockClearcutLogger.enqueueLogEvent).toHaveBeenCalled();
  });

  it('should log policy generation error to Clearcut', () => {
    const event = new ConsecaPolicyGenerationEvent(
      'user prompt',
      'trusted content',
      '{}',
      'some error',
    );

    logConsecaPolicyGeneration(mockConfig, event);

    expect(mockClearcutLogger.createLogEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          value: 'some error',
        }),
      ]),
    );
  });

  it('should log verdict event to OTEL and Clearcut', () => {
    const event = new ConsecaVerdictEvent(
      'user prompt',
      'policy',
      'tool call',
      'allow',
      'rationale',
    );

    logConsecaVerdict(mockConfig, event);

    // Verify OTEL
    expect(logs.getLogger).toHaveBeenCalled();
    expect(mockLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Conseca Verdict: allow.',
        attributes: expect.objectContaining({
          'event.name': EVENT_CONSECA_VERDICT,
        }),
      }),
    );

    // Verify Clearcut
    expect(ClearcutLogger.getInstance).toHaveBeenCalledWith(mockConfig);
    expect(mockClearcutLogger.createLogEvent).toHaveBeenCalled();
    expect(mockClearcutLogger.enqueueLogEvent).toHaveBeenCalled();
  });

  it('should not log if SDK is not initialized', () => {
    vi.mocked(sdk.isTelemetrySdkInitialized).mockReturnValue(false);
    const event = new ConsecaPolicyGenerationEvent('a', 'b', 'c');

    logConsecaPolicyGeneration(mockConfig, event);

    expect(mockLogger.emit).not.toHaveBeenCalled();
  });

  it('should omit user_prompt/trusted_content/policy from OTEL when logPrompts is disabled', () => {
    const configNoPrompts = {
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
      getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
    } as unknown as Config;

    const event = new ConsecaPolicyGenerationEvent(
      'sensitive prompt',
      'sensitive content',
      'sensitive policy',
    );

    logConsecaPolicyGeneration(configNoPrompts, event);

    const attrs = mockLogger.emit.mock.calls[0][0].attributes as Record<
      string,
      unknown
    >;
    expect(attrs['user_prompt']).toBeUndefined();
    expect(attrs['trusted_content']).toBeUndefined();
    expect(attrs['policy']).toBeUndefined();
    expect(attrs['event.name']).toBe(EVENT_CONSECA_POLICY_GENERATION);
  });

  it('should omit user_prompt/trusted_content/policy from Clearcut when logPrompts is disabled', () => {
    const configNoPrompts = {
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
      getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
    } as unknown as Config;

    const event = new ConsecaPolicyGenerationEvent(
      'sensitive prompt',
      'sensitive content',
      'sensitive policy',
      'some error',
    );

    logConsecaPolicyGeneration(configNoPrompts, event);

    expect(mockClearcutLogger.createLogEvent).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          gemini_cli_key: EventMetadataKey.CONSECA_ERROR,
          value: 'some error',
        },
      ],
    );
  });

  it('should include user_prompt/trusted_content/policy in OTEL when logPrompts is enabled', () => {
    const event = new ConsecaPolicyGenerationEvent(
      'visible prompt',
      'visible content',
      'visible policy',
    );

    logConsecaPolicyGeneration(mockConfig, event);

    const attrs = mockLogger.emit.mock.calls[0][0].attributes as Record<
      string,
      unknown
    >;
    expect(attrs['user_prompt']).toBe('visible prompt');
    expect(attrs['trusted_content']).toBe('visible content');
    expect(attrs['policy']).toBe('visible policy');
  });

  it('should omit sensitive fields from verdict OTEL when logPrompts is disabled', () => {
    const configNoPrompts = {
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
      getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
    } as unknown as Config;

    const event = new ConsecaVerdictEvent(
      'sensitive prompt',
      'sensitive policy',
      'sensitive tool call',
      'allow',
      'sensitive rationale',
    );

    logConsecaVerdict(configNoPrompts, event);

    const attrs = mockLogger.emit.mock.calls[0][0].attributes as Record<
      string,
      unknown
    >;
    expect(attrs['user_prompt']).toBeUndefined();
    expect(attrs['policy']).toBeUndefined();
    expect(attrs['tool_call']).toBeUndefined();
    expect(attrs['verdict_rationale']).toBeUndefined();
    // verdict (the allow/deny result) is not sensitive and should be present
    expect(attrs['verdict']).toBe('allow');
  });

  it('should omit sensitive fields from verdict Clearcut when logPrompts is disabled', () => {
    const configNoPrompts = {
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
      getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
      getExperiments: vi.fn().mockReturnValue({ experimentIds: [] }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
    } as unknown as Config;

    const event = new ConsecaVerdictEvent(
      'sensitive prompt',
      'sensitive policy',
      'sensitive tool call',
      'allow',
      'sensitive rationale',
      'some error',
    );

    logConsecaVerdict(configNoPrompts, event);

    expect(mockClearcutLogger.createLogEvent).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          gemini_cli_key: EventMetadataKey.CONSECA_VERDICT_RESULT,
          value: '"allow"',
        },
        {
          gemini_cli_key: EventMetadataKey.CONSECA_ERROR,
          value: 'some error',
        },
      ],
    );
  });

  it('should include sensitive fields in verdict OTEL when logPrompts is enabled', () => {
    const event = new ConsecaVerdictEvent(
      'visible prompt',
      'visible policy',
      'visible tool call',
      'deny',
      'visible rationale',
    );

    logConsecaVerdict(mockConfig, event);

    const attrs = mockLogger.emit.mock.calls[0][0].attributes as Record<
      string,
      unknown
    >;
    expect(attrs['user_prompt']).toBe('visible prompt');
    expect(attrs['policy']).toBe('visible policy');
    expect(attrs['tool_call']).toBe('visible tool call');
    expect(attrs['verdict_rationale']).toBe('visible rationale');
    expect(attrs['verdict']).toBe('deny');
  });
});
