/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { ContextTracer } from '../tracer.js';

export interface ContextEnvironment {
  getLlmClient(): BaseLlmClient;
  getSessionId(): string;
  getTraceDir(): string;
  getProjectTempDir(): string;
  getTracer(): ContextTracer;
  getCharsPerToken(): number;
}
