/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';

/**
 * A shared event emitter for application-wide communication
 * between decoupled parts of the CLI.
 */
export const updateEventEmitter = new EventEmitter();
