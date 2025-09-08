/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface PromptContext {
  promptId: string;
}

export const promptIdContext = new AsyncLocalStorage<PromptContext>();
