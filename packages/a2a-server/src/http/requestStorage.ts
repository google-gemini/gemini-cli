/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestStorage = new AsyncLocalStorage<{ req: express.Request }>();
