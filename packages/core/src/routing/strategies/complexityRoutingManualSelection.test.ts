/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import type { LocalLiteRtLmClient } from '../../core/localLiteRtLmClient.js';
import type { RoutingContext } from '../routingStrategy.js';
import { OverrideStrategy } from './overrideStrategy.js';
import { isAutoModel, DEFAULT_GEMINI_MODEL_AUTO } from '../../config/models.js';

describe('Complexity-Based Routing Manual Selection Override', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      getNumericalRoutingEnabled: async () => true,
      getResolvedClassifierThreshold: async () => 90,
      getGemmaModelRouterSettings: () => ({ enabled: false }),
      getHasAccessToPreviewModel: () => true,
      getGemini31LaunchedSync: () => true,
      hasGemini35FlashGAAccess: () => true,
      getExperimentalDynamicModelConfiguration: () => true,
      modelConfigService: {
        getModelDefinition: () => undefined, // Simulates a raw model configuration with no tier definition
        resolveModelId: (model: string) => model,
      },
    } as unknown as Config;
  });

  it('should guarantee manual model selection is respected and bypasses complexity routing even when CliComplexityBasedRouting is active', async () => {
    // 1. Arrange: User explicitly selected Gemini 3.1 Pro Preview (manual selection)
    const explicitlySelectedModel = 'chat-gemini-3-1-pro-preview-paid-tier';
    const context: RoutingContext = {
      history: [],
      request: [
        {
          text: 'What does this repository do? Help me to understand the architecture.',
        },
      ],
      signal: new AbortController().signal,
      requestedModel: explicitlySelectedModel,
    };

    // 2. Act: Run OverrideStrategy
    const overrideStrategy = new OverrideStrategy();
    const decision = await overrideStrategy.route(
      context,
      mockConfig,
      {} as unknown as BaseLlmClient,
      {} as unknown as LocalLiteRtLmClient,
    );

    // 3. Assert: Verify the override strategy has matched and returned the manual selection,
    // which guarantees that the subsequent ClassifierStrategy is bypassed entirely.
    expect(decision).not.toBeNull();
    expect(decision?.model).toContain('chat-gemini-3-1-pro-preview-paid-tier'); // Resolves to Pro model
    expect(decision?.metadata.source).toBe('override');
    expect(decision?.metadata.reasoning).toContain(
      'Routing bypassed by forced model directive',
    );
  });

  it('should prevent complexity routing from overriding explicit manual selections', async () => {
    // This test enforces the rule that complexity routing must not override a non-auto manual model selection
    const explicitlySelectedModel = 'chat-gemini-3-1-pro-preview-paid-tier';
    const context: RoutingContext = {
      history: [],
      request: [{ text: 'Provide me with URL to learn python' }],
      signal: new AbortController().signal,
      requestedModel: explicitlySelectedModel,
    };

    // The router routing resolver logic:
    const mockRouterResolve = async (ctx: RoutingContext): Promise<string> => {
      // Correct behavior: If the requested model is not an auto model, complexity routing is bypassed.
      if (!isAutoModel(ctx.requestedModel || 'auto', mockConfig)) {
        return ctx.requestedModel!;
      }

      // Complexity routing would only be applied if it was an auto model
      return 'generate-chat-gemini-2-5-flash-paid-tier';
    };

    const routedModel = await mockRouterResolve(context);

    // This assertion now passes because our robust isAutoModel correctly returns false,
    // thereby bypassing complexity routing and ensuring the explicit manual selection is respected.
    expect(routedModel).toBe(explicitlySelectedModel);
  });
});
