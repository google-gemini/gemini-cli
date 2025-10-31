/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ModelGenerationConfigService } from './modelGenerationConfigService.js';
import type { ModelGenerationServiceConfig } from './modelGenerationConfigService.js';

// This test suite is designed to validate the end-to-end logic of the
// ModelGenerationConfigService with a complex, realistic configuration.
// It tests the interplay of global settings, alias inheritance, and overrides
// of varying specificities.
describe('ModelGenerationConfigService Integration', () => {
  const complexConfig: ModelGenerationServiceConfig = {
    // Global defaults that should apply to everything unless overridden.
    config: {
      temperature: 0.8,
      topP: 1.0,
      stopSequences: ['STOP'],
    },
    aliases: {
      // Abstract base with no model
      base: {
        settings: {
          config: {
            topP: 0.95,
            topK: 64,
          },
        },
      },
      'default-text-model': {
        extends: 'base',
        settings: {
          model: 'gemini-1.5-pro-latest',
          config: {
            topK: 40, // Override base
          },
        },
      },
      'creative-writer': {
        extends: 'default-text-model',
        settings: {
          config: {
            temperature: 0.9, // Override global
            topK: 50, // Override parent
          },
        },
      },
      'fast-classifier': {
        extends: 'base',
        settings: {
          model: 'gemini-1.5-flash-latest',
          config: {
            temperature: 0.1,
            candidateCount: 4,
          },
        },
      },
    },
    overrides: [
      // Broad override for all flash models
      {
        match: { model: 'gemini-1.5-flash-latest' },
        settings: {
          config: {
            maxOutputTokens: 2048,
          },
        },
      },
      // Specific override for the 'core' agent
      {
        match: { agent: 'core' },
        settings: {
          config: {
            temperature: 0.5,
            stopSequences: ['AGENT_STOP'],
          },
        },
      },
      // Highly specific override for the 'fast-classifier' when used by the 'core' agent
      {
        match: { model: 'fast-classifier', agent: 'core' },
        settings: {
          config: {
            temperature: 0.0,
            maxOutputTokens: 4096,
          },
        },
      },
      // Override to provide a model for the abstract alias
      {
        match: { model: 'base', agent: 'core' },
        settings: {
          model: 'gemini-1.5-pro-latest',
        },
      },
    ],
  };

  const service = new ModelGenerationConfigService(complexConfig);

  it('should resolve a simple model, applying core agent defaults', () => {
    const resolved = service.getResolvedConfig({
      model: 'gemini-test-model',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 1.0, // from global
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should correctly apply a simple inherited alias and merge with global defaults', () => {
    const resolved = service.getResolvedConfig({
      model: 'default-text-model',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from alias
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 0.95, // from base
      topK: 40, // from alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should resolve a multi-level inherited alias', () => {
    const resolved = service.getResolvedConfig({
      model: 'creative-writer',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from default-text-model
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 0.95, // from base
      topK: 50, // from alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should apply an inherited alias and a broad model-based override', () => {
    const resolved = service.getResolvedConfig({
      model: 'fast-classifier',
      // No agent specified, so it should match core agent-specific rules
    });

    expect(resolved.model).toBe('gemini-1.5-flash-latest'); // from alias
    expect(resolved.sdkConfig).toEqual({
      topP: 0.95, // from base
      topK: 64, // from base
      candidateCount: 4, // from alias
      stopSequences: ['AGENT_STOP'], // from agent override
      maxOutputTokens: 4096, // from most specific override
      temperature: 0.0, // from most specific override
    });
  });

  it('should apply settings for an unknown model but a known agent', () => {
    const resolved = service.getResolvedConfig({
      model: 'gemini-test-model',
      agent: 'core',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 1.0, // from global
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should apply the most specific override for a known inherited alias and agent', () => {
    const resolved = service.getResolvedConfig({
      model: 'fast-classifier',
      agent: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-flash-latest');
    expect(resolved.sdkConfig).toEqual({
      // Inherited from 'base'
      topP: 0.95,
      topK: 64,
      // From 'fast-classifier' alias
      candidateCount: 4,
      // From 'core' agent override
      stopSequences: ['AGENT_STOP'],
      // From most specific override (model+agent)
      temperature: 0.0,
      maxOutputTokens: 4096,
    });
  });

  it('should correctly apply agent override on top of a multi-level inherited alias', () => {
    const resolved = service.getResolvedConfig({
      model: 'creative-writer',
      agent: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from default-text-model
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override (wins over alias)
      topP: 0.95, // from base
      topK: 50, // from creative-writer alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should resolve an abstract alias if a specific override provides the model', () => {
    const resolved = service.getResolvedConfig({
      model: 'base',
      agent: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from override
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 0.95, // from base alias
      topK: 64, // from base alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should not apply core agent overrides when a different agent is specified', () => {
    const resolved = service.getResolvedConfig({
      model: 'gemini-test-model',
      agent: 'non-core-agent',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.sdkConfig).toEqual({
      temperature: 0.8, // from global
      topP: 1.0, // from global
      stopSequences: ['STOP'], // from global
    });
  });
});
