/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextEnvironment, RenderOptions } from './environment.js';
import type { ContextEventBus } from '../eventBus.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import { LiveInbox } from './inbox.js';
import type { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';
import { ContextGraphMapper } from '../graph/mapper.js';

export class ContextEnvironmentImpl implements ContextEnvironment {
  readonly inbox: LiveInbox;
  readonly graphMapper: ContextGraphMapper;

  constructor(
    private readonly llmClientProvider: () => BaseLlmClient,
    readonly sessionId: string,
    readonly promptId: string,
    readonly traceDir: string,
    readonly projectTempDir: string,
    readonly tracer: ContextTracer,
    readonly charsPerToken: number,
    readonly eventBus: ContextEventBus,
    readonly tokenCalculator: ContextTokenCalculator,
    readonly behaviorRegistry: NodeBehaviorRegistry,
    readonly renderOptions?: RenderOptions,
  ) {
    this.inbox = new LiveInbox();
    this.graphMapper = new ContextGraphMapper();
  }

  get llmClient(): BaseLlmClient {
    return this.llmClientProvider();
  }
}
