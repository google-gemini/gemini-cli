/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JSONSchemaType } from 'ajv';

export interface ContextProcessorDef<T = unknown> {
  readonly id: string;
  readonly schema: JSONSchemaType<T>;
}

/**
 * Registry for validating declarative sidecar configuration schemas.
 * (Dynamic instantiation has been replaced by static ContextProfiles)
 */
export class ContextProcessorRegistry {
  private readonly processors = new Map<string, ContextProcessorDef>();

  registerProcessor<T>(def: ContextProcessorDef<T>) {
    // Erasing the type.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    this.processors.set(def.id, def as unknown as ContextProcessorDef<unknown>);
  }

  getSchema(id: string): object | undefined {
    return this.processors.get(id)?.schema;
  }

  getSchemaDefs(): ContextProcessorDef[] {
    const defs = [];
    for (const def of this.processors.values()) {
      if (def.schema) defs.push({ id: def.id, schema: def.schema });
    }
    return defs;
  }

  clear() {
    this.processors.clear();
  }
}
