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
      'ALLOW',
      'rationale',
    );

    logConsecaVerdict(mockConfig, event);

    // Verify OTEL
    expect(logs.getLogger).toHaveBeenCalled();
    expect(mockLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Conseca Verdict: ALLOW.',
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
});
