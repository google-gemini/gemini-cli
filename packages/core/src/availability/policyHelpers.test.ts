/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePolicyChain,
  buildFallbackPolicyContext,
} from './policyHelpers.js';
import { createDefaultPolicy } from './policyCatalog.js';
import type { Config } from '../config/config.js';

describe('policyHelpers', () => {
  describe('resolvePolicyChain', () => {
    it('inserts the active model when missing from the catalog', () => {
      const config = {
        getPreviewFeatures: () => false,
        getUserTier: () => undefined,
        getModel: () => 'custom-model',
        isInFallbackMode: () => false,
      } as unknown as Config;
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe('custom-model');
    });

    it('leaves catalog order untouched when active model already present', () => {
      const config = {
        getPreviewFeatures: () => false,
        getUserTier: () => undefined,
        getModel: () => 'gemini-2.5-pro',
        isInFallbackMode: () => false,
      } as unknown as Config;
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
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
      expect(context.candidates.map((p) => p.model)).toEqual(['c']);
    });

    it('returns full chain when model is not in policy list', () => {
      const chain = [createDefaultPolicy('a'), createDefaultPolicy('b')];
      const context = buildFallbackPolicyContext(chain, 'x');
      expect(context.failedPolicy).toBeUndefined();
      expect(context.candidates).toEqual(chain);
    });
  });
});
