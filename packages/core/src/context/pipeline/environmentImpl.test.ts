/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { ContextEnvironmentImpl } from './environmentImpl.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { ContextTracer } from '../tracer.js';

describe('ContextEnvironmentImpl', () => {
  it('should initialize with provided dependencies and default optional ones', () => {
    // Mock required dependencies
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const llmClient = {} as BaseLlmClient;
    const tracer = new ContextTracer({
      targetDir: '/tmp',
      sessionId: 'test-session',
    });

    const env = new ContextEnvironmentImpl(
      llmClient,
      'test-session',
      'test-prompt-id',
      '/tmp/trace',
      '/tmp/temp',
      tracer,
      4,
    );

    // Verify injected properties
    expect(env.llmClient).toBe(llmClient);
    expect(env.sessionId).toBe('test-session');
    expect(env.promptId).toBe('test-prompt-id');
    expect(env.traceDir).toBe('/tmp/trace');
    expect(env.projectTempDir).toBe('/tmp/temp');
    expect(env.tracer).toBe(tracer);
    expect(env.charsPerToken).toBe(4);

    // Verify default initialized properties
    expect(env.tokenCalculator).toBeDefined();
    expect(env.fileSystem).toBeDefined();
    expect(env.idGenerator).toBeDefined();
    expect(env.snapshotCache).toBeDefined();
    expect(env.behaviorRegistry).toBeDefined();
    expect(env.irMapper).toBeDefined();
  });
});
