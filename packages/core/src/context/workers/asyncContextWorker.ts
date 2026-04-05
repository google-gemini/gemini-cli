/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextEventBus } from '../eventBus.js';

export interface AsyncContextWorker {
  /** The unique name of the worker (e.g., 'StateSnapshotWorker') */
  readonly name: string;

  /** Starts listening to the ContextEventBus for background tasks */
  start(bus: ContextEventBus): void;

  /** Stops listening and aborts any pending background tasks */
  stop(): void;
}
