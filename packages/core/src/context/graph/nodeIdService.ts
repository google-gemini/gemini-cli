/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provides a durable mapping between history object references and their
 * corresponding graph node IDs. This ensures that context management logic
 * can track the identity of turns even after they are transformed (e.g. scrubbed
 * or hardened) without polluting the raw JSON sent to the Gemini API.
 */
export class NodeIdService {
  constructor(private readonly map: WeakMap<object, string> = new WeakMap()) {}

  get(obj: object): string | undefined {
    return this.map.get(obj);
  }

  set(obj: object, id: string): void {
    this.map.set(obj, id);
  }
}
