/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ContextProcessorDef {
  readonly id: string;
  readonly schema: object;
}

export interface ContextWorkerDef {
  readonly id: string;
  readonly schema: object;
}

/**
 * Registry for validating declarative sidecar configuration schemas.
 * (Dynamic instantiation has been replaced by static ContextProfiles)
 */
export class SidecarRegistry {
  private processors = new Map<string, ContextProcessorDef>();
  private workers = new Map<string, ContextWorkerDef>();

  registerProcessor(def: ContextProcessorDef) {
    this.processors.set(def.id, def);
  }

  registerWorker(def: ContextWorkerDef) {
    this.workers.set(def.id, def);
  }

  getSchema(id: string): object | undefined {
    return this.processors.get(id)?.schema || this.workers.get(id)?.schema;
  }

  getSchemaDefs(): { id: string; schema: object }[] {
    const defs: { id: string; schema: object }[] = [];
    for (const def of this.processors.values()) {
      if (def.schema) defs.push({ id: def.id, schema: def.schema });
    }
    for (const def of this.workers.values()) {
      if (def.schema) defs.push({ id: def.id, schema: def.schema });
    }
    return defs;
  }

  clear() {
    this.processors.clear();
    this.workers.clear();
  }
}
