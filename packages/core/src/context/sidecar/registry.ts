/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from './environment.js';


export interface ContextProcessorDef<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly schema?: object;
  create(
    env: ContextEnvironment,
    options: TOptions,
  ): ContextProcessor;
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

  static getSchemas(): object[] {
    const schemas: object[] = [];
    for (const def of this.processors.values()) {
      if (def.schema) {
        schemas.push(def.schema);
      }
    }
    return schemas;
  }

  static clear() {
    this.processors.clear();
  }
}
