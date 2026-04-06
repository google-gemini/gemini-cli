/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IIdGenerator } from './IIdGenerator.js';

export class DeterministicIdGenerator implements IIdGenerator {
  private counter = 0;

  constructor(private prefix: string = 'id-') {}

  generateId(): string {
    this.counter++;
    return `${this.prefix}${this.counter}`;
  }
}
