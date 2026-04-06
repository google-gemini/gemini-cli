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
  constructor(
    public readonly llmClient: BaseLlmClient,
    public readonly sessionId: string,
    public readonly promptId: string,
    public readonly traceDir: string,
    public readonly projectTempDir: string,
    public readonly tracer: ContextTracer,
    public readonly charsPerToken: number,
    public readonly eventBus: ContextEventBus,
  ) {}
}
