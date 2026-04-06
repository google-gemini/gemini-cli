/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextEnvironment } from './environment.js';

import type { ContextEventBus } from '../eventBus.js';

import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { IFileSystem } from '../system/IFileSystem.js';
import { NodeFileSystem } from '../system/NodeFileSystem.js';
import type { IIdGenerator } from '../system/IIdGenerator.js';
import { NodeIdGenerator } from '../system/NodeIdGenerator.js';

export class ContextEnvironmentImpl implements ContextEnvironment {
  public readonly tokenCalculator: ContextTokenCalculator;
  public readonly fileSystem: IFileSystem;
  public readonly idGenerator: IIdGenerator;

  constructor(
    public readonly llmClient: BaseLlmClient,
    public readonly sessionId: string,
    public readonly promptId: string,
    public readonly traceDir: string,
    public readonly projectTempDir: string,
    public readonly tracer: ContextTracer,
    public readonly charsPerToken: number,
    public readonly eventBus: ContextEventBus,
    fileSystem?: IFileSystem,
    idGenerator?: IIdGenerator,
  ) {
    this.tokenCalculator = new ContextTokenCalculator(this.charsPerToken);
    this.fileSystem = fileSystem || new NodeFileSystem();
    this.idGenerator = idGenerator || new NodeIdGenerator();
  }
}
