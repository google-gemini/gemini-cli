/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { IIdGenerator } from './IIdGenerator.js';

export class NodeIdGenerator implements IIdGenerator {
  generateId(): string {
    return randomUUID();
  }
}
