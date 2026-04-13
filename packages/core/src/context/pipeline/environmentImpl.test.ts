/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { ContextEnvironmentImpl } from './environmentImpl.js';
import { ContextTracer } from '../tracer.js';
import { ContextEventBus } from '../eventBus.js';
import { createMockLlmClient } from '../testing/contextTestUtils.js';

describe('ContextEnvironmentImpl', () => {
  it('should initialize with defaults correctly', () => {
    const tracer = new ContextTracer({ targetDir: '/tmp', sessionId: 'mock' });
    const eventBus = new ContextEventBus();
    const mockLlmClient = createMockLlmClient();

    const env = new ContextEnvironmentImpl(
      mockLlmClient,
      'mock-session',
      'mock-prompt',
      '/tmp/trace',
      '/tmp/temp',
      tracer,
      4,
      eventBus,
    );

    expect(env.llmClient).toBe(mockLlmClient);
    expect(env.sessionId).toBe('mock-session');
    expect(env.promptId).toBe('mock-prompt');
    expect(env.traceDir).toBe('/tmp/trace');
    expect(env.projectTempDir).toBe('/tmp/temp');
    expect(env.tracer).toBe(tracer);
    expect(env.charsPerToken).toBe(4);
    expect(env.eventBus).toBe(eventBus);

    // Default internals
    expect(env.behaviorRegistry).toBeDefined();
    expect(env.tokenCalculator).toBeDefined();
    expect(env.inbox).toBeDefined();
    expect(env.graphMapper).toBeDefined();
  });
});
