/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextProcessorDef {
  readonly id: string;
  readonly schema: object;
}

/**
 * Registry for validating declarative sidecar configuration schemas.
 * (Dynamic instantiation has been replaced by static ContextProfiles)
 */
export class SidecarRegistry {
  private processors = new Map<string, ContextProcessorDef>();

  registerProcessor(def: ContextProcessorDef) {
    this.processors.set(def.id, def);
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
