/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextEventBus } from '../eventBus.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { ContextTracer } from '../tracer.js';
import type { IFileSystem } from '../system/IFileSystem.js';
import type { IIdGenerator } from '../system/IIdGenerator.js';
import type { LiveInbox } from './inbox.js';

export type { ContextTracer, ContextEventBus };

export interface ContextEnvironment {
  readonly llmClient: BaseLlmClient;
  readonly promptId: string;
  readonly sessionId: string;
  readonly traceDir: string;
  readonly projectTempDir: string;
  readonly tracer: ContextTracer;
  readonly charsPerToken: number;
  readonly tokenCalculator: ContextTokenCalculator;
  readonly fileSystem: IFileSystem;
  readonly idGenerator: IIdGenerator;
  readonly eventBus: ContextEventBus;
  readonly inbox: LiveInbox;
  readonly behaviorRegistry: import('../ir/behaviorRegistry.js').IrNodeBehaviorRegistry;
  readonly irMapper: import('../ir/mapper.js').IrMapper;
}
