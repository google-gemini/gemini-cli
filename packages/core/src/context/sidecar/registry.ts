/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor } from '../pipeline.js';
import type { AsyncContextWorker } from '../workers/asyncContextWorker.js';
import type { ContextEnvironment } from './environment.js';

export interface ContextProcessorDef<TOptions extends Record<string, unknown> = any> {
  readonly id: string;
  create(env: ContextEnvironment, options: TOptions): ContextProcessor | AsyncContextWorker;
}

/**
 * Registry for mapping declarative sidecar configs to running Processor instances.
 */
export class ProcessorRegistry {
  private static processors = new Map<string, ContextProcessorDef>();

  static register(def: ContextProcessorDef) {
    this.processors.set(def.id, def);
  }

  static get(id: string): ContextProcessorDef {
    const def = this.processors.get(id);
    if (!def) {
      throw new Error(`Context Processor [${id}] is not registered.`);
    }
    return def;
  }

  static clear() {
    this.processors.clear();
  }
}
