/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';
import type { ContextEnvironment } from './environment.js';
import { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { IFileSystem } from '../system/IFileSystem.js';
import { NodeFileSystem } from '../system/NodeFileSystem.js';
import type { IIdGenerator } from '../system/IIdGenerator.js';
import { NodeIdGenerator } from '../system/NodeIdGenerator.js';
import { LiveSnapshotCache } from './snapshotCache.js';
import { IrNodeBehaviorRegistry } from '../ir/behaviorRegistry.js';
import { registerBuiltInBehaviors } from '../ir/builtinBehaviors.js';
import { IrMapper } from '../ir/mapper.js';
import type { SnapshotCache } from '../pipeline.js';

export class ContextEnvironmentImpl implements ContextEnvironment {
  readonly tokenCalculator: ContextTokenCalculator;
  readonly fileSystem: IFileSystem;
  readonly idGenerator: IIdGenerator;
  readonly snapshotCache: SnapshotCache;
  readonly behaviorRegistry: IrNodeBehaviorRegistry;
  readonly irMapper: IrMapper;

  constructor(
    readonly llmClient: BaseLlmClient,
    readonly sessionId: string,
    readonly promptId: string,
    readonly traceDir: string,
    readonly projectTempDir: string,
    readonly tracer: ContextTracer,
    readonly charsPerToken: number,
    fileSystem?: IFileSystem,
    idGenerator?: IIdGenerator,
  ) {
    this.behaviorRegistry = new IrNodeBehaviorRegistry();
    registerBuiltInBehaviors(this.behaviorRegistry);
    this.tokenCalculator = new ContextTokenCalculator(
      this.charsPerToken,
      this.behaviorRegistry,
    );
    this.fileSystem = fileSystem || new NodeFileSystem();
    this.idGenerator = idGenerator || new NodeIdGenerator();
    this.snapshotCache = new LiveSnapshotCache();
    this.irMapper = new IrMapper(this.behaviorRegistry, this.idGenerator);
  }
}
