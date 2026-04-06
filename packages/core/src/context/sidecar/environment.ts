/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
 import type { BaseLlmClient } from '../../core/baseLlmClient.js';
 import type { ContextTracer } from '../tracer.js';
 import type { ContextEventBus } from '../eventBus.js';
 export type { ContextTracer, ContextEventBus };

 export interface ContextEnvironment {
  getLlmClient(): BaseLlmClient;
  getPromptId(): string;
  getSessionId(): string;
  getTraceDir(): string;
  getProjectTempDir(): string;
  getEventBus(): ContextEventBus;
  getTracer(): ContextTracer;
  getCharsPerToken(): number;
}
