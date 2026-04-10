/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { Episode, ConcreteNode } from './types.js';
import { toIr } from './toIr.js';
import { fromIr } from './fromIr.js';
import type { ContextTokenCalculator } from '../utils/contextTokenCalculator.js';
import type { IrNodeBehaviorRegistry } from './behaviorRegistry.js';
import type { IIdGenerator } from '../system/IIdGenerator.js';

export class IrMapper {
  private readonly nodeIdentityMap = new WeakMap<object, string>();

  constructor(
    private readonly registry: IrNodeBehaviorRegistry,
    private readonly idGenerator: IIdGenerator,
  ) {}

  toIr(
    history: readonly Content[],
    tokenCalculator: ContextTokenCalculator,
  ): Episode[] {
    return toIr(
      history,
      tokenCalculator,
      this.nodeIdentityMap,
      this.idGenerator,
    );
  }

  fromIr(nodes: readonly ConcreteNode[]): Content[] {
    return fromIr(nodes, this.registry);
  }
}
