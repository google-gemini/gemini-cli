/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextEnvironment } from './environment.js';

export class ContextEnvironmentImpl implements ContextEnvironment {
  constructor(
    private llmClient: BaseLlmClient,
    private sessionId: string,
    private traceDir: string,
    private tempDir: string,
    private tracer: ContextTracer,
    private charsPerToken: number,
  ) {}

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
}
