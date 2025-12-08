/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolvePolicyChain,
  buildFallbackPolicyContext,
  applyModelSelection,
} from './policyHelpers.js';
import { createDefaultPolicy } from './policyCatalog.js';
import type { Config } from '../config/config.js';

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    getPreviewFeatures: () => false,
    getUserTier: () => undefined,
    getModel: () => 'gemini-2.5-pro',
    isInFallbackMode: () => false,
    ...overrides,
  }) as unknown as Config;

describe('policyHelpers', () => {
  describe('resolvePolicyChain', () => {
    it('inserts the active model when missing from the catalog', () => {
      const config = createMockConfig({
        getModel: () => 'custom-model',
      });
      const chain = resolvePolicyChain(config);
      expect(chain).toHaveLength(1);
      expect(chain[0]?.model).toBe('custom-model');
    });

    it('leaves catalog order untouched when active model already present', () => {
      const config = createMockConfig({
        getModel: () => 'gemini-2.5-pro',
      });
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
    });

    it('returns the default chain when active model is "auto"', () => {
      const config = createMockConfig({
        getModel: () => 'auto',
      });
      const chain = resolvePolicyChain(config);

      // Expect default chain [Pro, Flash]
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
    });
  });

  describe('buildFallbackPolicyContext', () => {
    it('returns remaining candidates after the failed model', () => {
      const chain = [
        createDefaultPolicy('a'),
        createDefaultPolicy('b'),
        createDefaultPolicy('c'),
      ];
      const context = buildFallbackPolicyContext(chain, 'b');
      expect(context.failedPolicy?.model).toBe('b');
      expect(context.candidates.map((p) => p.model)).toEqual(['c', 'a']);
    });

    it('returns full chain when model is not in policy list', () => {
      const chain = [createDefaultPolicy('a'), createDefaultPolicy('b')];
      const context = buildFallbackPolicyContext(chain, 'x');
      expect(context.failedPolicy).toBeUndefined();
      expect(context.candidates).toEqual(chain);
    });
  });

  describe('applyModelSelection', () => {
    const mockModelConfigService = {
      getResolvedConfig: vi.fn(),
    };

    const mockAvailabilityService = {
      selectFirstAvailable: vi.fn(),
      consumeStickyAttempt: vi.fn(),
    };

    const createExtendedMockConfig = (
      overrides: Partial<Config> = {},
    ): Config => {
      const defaults = {
        isModelAvailabilityServiceEnabled: () => true,
        getModelAvailabilityService: () => mockAvailabilityService,
        setActiveModel: vi.fn(),
        modelConfigService: mockModelConfigService,
      };
      return createMockConfig({ ...defaults, ...overrides } as Partial<Config>);
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns requested model if availability service is disabled', () => {
      const config = createExtendedMockConfig({
        isModelAvailabilityServiceEnabled: () => false,
      });
      const result = applyModelSelection(config, 'gemini-pro');
      expect(result.model).toBe('gemini-pro');
      expect(config.setActiveModel).not.toHaveBeenCalled();
    });

    it('returns requested model if it is available', () => {
      const config = createExtendedMockConfig();
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
      });

      const result = applyModelSelection(config, 'gemini-pro');
      expect(result.model).toBe('gemini-pro');
      expect(result.maxAttempts).toBeUndefined();
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-pro');
    });

    it('switches to backup model and updates config if requested is unavailable', () => {
      const config = createExtendedMockConfig();
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-flash',
      });
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        generateContentConfig: { temperature: 0.1 },
      });

      const currentConfig = { temperature: 0.9, topP: 1 };
      const result = applyModelSelection(config, 'gemini-pro', currentConfig);

      expect(result.model).toBe('gemini-flash');
      expect(result.config).toEqual({
        temperature: 0.1,
        topP: 1,
      });

      expect(mockModelConfigService.getResolvedConfig).toHaveBeenCalledWith({
        model: 'gemini-flash',
      });
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-flash');
    });

    it('consumes sticky attempt if indicated', () => {
      const config = createExtendedMockConfig();
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
        attempts: 1,
      });

      const result = applyModelSelection(config, 'gemini-pro');
      expect(mockAvailabilityService.consumeStickyAttempt).toHaveBeenCalledWith(
        'gemini-pro',
      );
      expect(result.maxAttempts).toBe(1);
    });

    it('does not consume sticky attempt if consumeAttempt is false', () => {
      const config = createExtendedMockConfig();
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
        attempts: 1,
      });

      const result = applyModelSelection(
        config,
        'gemini-pro',
        undefined,
        undefined,
        {
          consumeAttempt: false,
        },
      );
      expect(
        mockAvailabilityService.consumeStickyAttempt,
      ).not.toHaveBeenCalled();
      expect(result.maxAttempts).toBe(1);
    });
  });
});
