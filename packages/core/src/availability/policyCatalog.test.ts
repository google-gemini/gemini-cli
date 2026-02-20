/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultPolicy,
  getModelPolicyChain,
  validateModelPolicyChain,
} from './policyCatalog.js';
import {
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import type { Config } from '../config/config.js';

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    getEnableModelConfigurability: () => false,
    getModelChains: () => undefined,
    ...overrides,
  }) as unknown as Config;

describe('policyCatalog', () => {
  it('returns preview chain when preview enabled', () => {
    const chain = getModelPolicyChain(
      { previewEnabled: true },
      createMockConfig(),
    );
    expect(chain![0]?.model).toBe(PREVIEW_GEMINI_MODEL);
    expect(chain).toHaveLength(2);
  });

  it('returns default chain when preview disabled', () => {
    const chain = getModelPolicyChain(
      { previewEnabled: false },
      createMockConfig(),
    );
    expect(chain![0]?.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(chain).toHaveLength(2);
  });

  it('marks preview transients as sticky retries', () => {
    const chain = getModelPolicyChain(
      { previewEnabled: true },
      createMockConfig(),
    );
    const previewPolicy = chain![0];
    expect(previewPolicy.model).toBe(PREVIEW_GEMINI_MODEL);
    expect(previewPolicy.stateTransitions.transient).toBe('terminal');
  });

  it('applies default actions and state transitions for unspecified kinds', () => {
    const chain = getModelPolicyChain(
      { previewEnabled: true },
      createMockConfig(),
    );
    const previewPolicy = chain![0];
    expect(previewPolicy.stateTransitions.not_found).toBe('terminal');
    expect(previewPolicy.stateTransitions.unknown).toBe('terminal');
    expect(previewPolicy.actions.unknown).toBe('prompt');
  });

  it('clones policy maps so edits do not leak between calls', () => {
    const firstCall = getModelPolicyChain(
      { previewEnabled: false },
      createMockConfig(),
    );
    firstCall![0].actions.terminal = 'silent';
    const secondCall = getModelPolicyChain(
      { previewEnabled: false },
      createMockConfig(),
    );
    expect(secondCall![0].actions.terminal).toBe('prompt');
  });

  it('returns custom chain when provided', () => {
    const customChain = [
      { ...createDefaultPolicy('custom-model'), isLastResort: true },
    ];
    const customConfig = createMockConfig({
      getEnableModelConfigurability: () => true,
      getModelChains: () => ({ default: customChain }),
    });
    const chain = getModelPolicyChain({ previewEnabled: false }, customConfig);
    expect(chain![0].model).toBe('custom-model');
    expect(chain).toHaveLength(1);
  });

  it('passes when there is exactly one last-resort policy', () => {
    const validChain = [
      createDefaultPolicy('test-model'),
      { ...createDefaultPolicy('last-resort'), isLastResort: true },
    ];
    expect(() => validateModelPolicyChain(validChain)).not.toThrow();
  });

  it('fails when no policies are marked last-resort', () => {
    const chain = [
      createDefaultPolicy('model-a'),
      createDefaultPolicy('model-b'),
    ];
    expect(() => validateModelPolicyChain(chain)).toThrow(
      'must include an `isLastResort`',
    );
  });

  it('fails when a single-model chain is not last-resort', () => {
    const chain = [createDefaultPolicy('lonely-model')];
    expect(() => validateModelPolicyChain(chain)).toThrow(
      'must include an `isLastResort`',
    );
  });

  it('fails when multiple policies are marked last-resort', () => {
    const chain = [
      { ...createDefaultPolicy('model-a'), isLastResort: true },
      { ...createDefaultPolicy('model-b'), isLastResort: true },
    ];
    expect(() => validateModelPolicyChain(chain)).toThrow(
      'must only have one `isLastResort`',
    );
  });

  it('createDefaultPolicy seeds default actions and states', () => {
    const policy = createDefaultPolicy('custom');
    expect(policy.actions.terminal).toBe('prompt');
    expect(policy.actions.unknown).toBe('prompt');
    expect(policy.stateTransitions.terminal).toBe('terminal');
    expect(policy.stateTransitions.unknown).toBe('terminal');
  });
});
