/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor, ContextWorker } from '../pipeline.js';
import type { ContextEnvironment } from './environment.js';

export interface ContextProcessorDef<TOptions = object> {
  readonly id: string;
  readonly schema: object;
  create(env: ContextEnvironment, options: TOptions): ContextProcessor;
}

export interface ContextWorkerDef<TOptions = object> {
  readonly id: string;
  readonly schema: object;
  create(env: ContextEnvironment, options: TOptions): ContextWorker;
}

/**
 * Registry for mapping declarative sidecar configs to running components.
 */
export class SidecarRegistry {
  private processors = new Map<string, ContextProcessorDef<unknown>>();
  private workers = new Map<string, ContextWorkerDef<unknown>>();

  registerProcessor<TOptions>(def: ContextProcessorDef<TOptions>) {
    this.processors.set(def.id, def);
  }

  registerWorker<TOptions>(def: ContextWorkerDef<TOptions>) {
    this.workers.set(def.id, def);
  }

  getProcessor(id: string): ContextProcessorDef {
    const def = this.processors.get(id);
    if (!def) {
      throw new Error(`Context Processor [${id}] is not registered.`);
    }
    return def;
  }

  getWorker(id: string): ContextWorkerDef {
    const def = this.workers.get(id);
    if (!def) {
      throw new Error(`Context Worker [${id}] is not registered.`);
    }
    return def;
  }

  getSchemas(): object[] {
    const schemas: object[] = [];
    for (const def of this.processors.values()) {
      if (def.schema) schemas.push(def.schema);
    }
    for (const def of this.workers.values()) {
      if (def.schema) schemas.push(def.schema);
    }
    return schemas;
  }

  clear() {
    this.processors.clear();
    this.workers.clear();
  }
}