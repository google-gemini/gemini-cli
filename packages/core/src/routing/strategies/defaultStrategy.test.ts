/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DefaultStrategy } from './defaultStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { DEFAULT_GEMINI_MODEL } from '../../config/models.js';

describe('DefaultStrategy', () => {
  it('should always route to the default Gemini model', async () => {
    const strategy = new DefaultStrategy();
    const mockContext = {} as RoutingContext;
    const mockClient = {} as BaseLlmClient;

    const decision = await strategy.route(mockContext, mockClient);

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      reason: `Routing to default model: ${DEFAULT_GEMINI_MODEL}`,
      metadata: {
        source: 'Default',
        latencyMs: 0,
      },
    });
  });
});
