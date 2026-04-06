/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextEnvironment } from './environment.js';

import type { ContextEventBus } from '../eventBus.js';

export class ContextEnvironmentImpl implements ContextEnvironment {
  private eventBus?: ContextEventBus;

  constructor(
    private llmClient: BaseLlmClient,
    private sessionId: string,
    private promptId: string,
    private traceDir: string,
    private tempDir: string,
    private tracer: ContextTracer,
    private charsPerToken: number,
  ) {}

  setEventBus(bus: ContextEventBus) {
    this.eventBus = bus;
  }

  getEventBus(): ContextEventBus {
    if (!this.eventBus) throw new Error('EventBus not bound');
    return this.eventBus;
  }

  getLlmClient(): BaseLlmClient {
    return this.llmClient;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getTraceDir(): string {
    return this.traceDir;
  }

  getProjectTempDir(): string {
    return this.tempDir;
  }

  getTracer(): ContextTracer {
    return this.tracer;
  }

  getCharsPerToken(): number {
    return this.charsPerToken;
  }

  getPromptId(): string {
    return this.promptId;
  }
}
