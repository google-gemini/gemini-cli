/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ModelConfigService } from './modelConfigService.js';
import type { ModelConfigServiceConfig } from './modelConfigService.js';

// This test suite is designed to validate the end-to-end logic of the
// ModelConfigService with a complex, realistic configuration.
// It tests the interplay of global settings, alias inheritance, and overrides
// of varying specificities.
describe('ModelConfigService Integration', () => {
  const complexConfig: ModelConfigServiceConfig = {
    aliases: {
      // Abstract base with no model
      base: {
        modelConfig: {
          generateContentConfig: {
            topP: 0.95,
            topK: 64,
          },
        },
      },
      'default-text-model': {
        extends: 'base',
        modelConfig: {
          model: 'gemini-1.5-pro-latest',
          generateContentConfig: {
            topK: 40, // Override base
          },
        },
      },
      'creative-writer': {
        extends: 'default-text-model',
        modelConfig: {
          generateContentConfig: {
            temperature: 0.9, // Override global
            topK: 50, // Override parent
          },
        },
      },
      'fast-classifier': {
        extends: 'base',
        modelConfig: {
          model: 'gemini-1.5-flash-latest',
          generateContentConfig: {
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
        modelConfig: {
          generateContentConfig: {
            maxOutputTokens: 2048,
          },
        },
      },
      // Specific override for the 'core' agent
      {
        match: { overrideScope: 'core' },
        modelConfig: {
          generateContentConfig: {
            temperature: 0.5,
            stopSequences: ['AGENT_STOP'],
          },
        },
      },
      // Highly specific override for the 'fast-classifier' when used by the 'core' agent
      {
        match: { model: 'fast-classifier', overrideScope: 'core' },
        modelConfig: {
          generateContentConfig: {
            temperature: 0.0,
            maxOutputTokens: 4096,
          },
        },
      },
      // Override to provide a model for the abstract alias
      {
        match: { model: 'base', overrideScope: 'core' },
        modelConfig: {
          model: 'gemini-1.5-pro-latest',
        },
      },
    ],
  };

  const service = new ModelConfigService(complexConfig);

  it('should resolve a simple model, applying core agent defaults', () => {
    const resolved = service.getResolvedConfig({
      model: 'gemini-test-model',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.5, // from agent override
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should correctly apply a simple inherited alias and merge with global defaults', () => {
    const resolved = service.getResolvedConfig({
      model: 'default-text-model',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from alias
    expect(resolved.generateContentConfig).toEqual({
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
    expect(resolved.generateContentConfig).toEqual({
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

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // now overridden by 'base'
    expect(resolved.generateContentConfig).toEqual({
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
      overrideScope: 'core',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.5, // from agent override
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should apply the most specific override for a known inherited alias and agent', () => {
    const resolved = service.getResolvedConfig({
      model: 'fast-classifier',
      overrideScope: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // now overridden by 'base'
    expect(resolved.generateContentConfig).toEqual({
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
      overrideScope: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from default-text-model
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.5, // from agent override (wins over alias)
      topP: 0.95, // from base
      topK: 50, // from creative-writer alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should resolve an abstract alias if a specific override provides the model', () => {
    const resolved = service.getResolvedConfig({
      model: 'base',
      overrideScope: 'core',
    });

    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from override
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.5, // from agent override
      topP: 0.95, // from base alias
      topK: 64, // from base alias
      stopSequences: ['AGENT_STOP'], // from agent override
    });
  });

  it('should not apply core agent overrides when a different agent is specified', () => {
    const resolved = service.getResolvedConfig({
      model: 'fast-classifier',
      overrideScope: 'non-core-agent',
    });

    expect(resolved.model).toBe('gemini-1.5-flash-latest');
    expect(resolved.generateContentConfig).toEqual({
      candidateCount: 4, // from alias
      maxOutputTokens: 2048, // from override of model
      temperature: 0.1, // from alias
      topK: 64, // from base
      topP: 0.95, // from base
    });
  });

  it('should correctly merge static aliases, runtime aliases, and overrides', () => {
    // Re-instantiate service for this isolated test to not pollute other tests
    const service = new ModelConfigService(complexConfig);

    // Register a runtime alias, simulating what LocalAgentExecutor does.
    // This alias extends a static base and provides its own settings.
    service.registerRuntimeModelConfig('agent-runtime:my-agent', {
      extends: 'creative-writer', // extends a multi-level alias
      modelConfig: {
        generateContentConfig: {
          temperature: 0.1, // Overrides parent
          maxOutputTokens: 8192, // Adds a new property
        },
      },
    });

    // Resolve the configuration for the runtime alias, with a matching agent scope
    const resolved = service.getResolvedConfig({
      model: 'agent-runtime:my-agent',
      overrideScope: 'core',
    });

    // Assert the final merged configuration.
    expect(resolved.model).toBe('gemini-1.5-pro-latest'); // from 'default-text-model'
    expect(resolved.generateContentConfig).toEqual({
      // from 'core' agent override, wins over runtime alias's 0.1 and creative-writer's 0.9
      temperature: 0.5,
      // from 'base' alias
      topP: 0.95,
      // from 'creative-writer' alias
      topK: 50,
      // from runtime alias
      maxOutputTokens: 8192,
      // from 'core' agent override
      stopSequences: ['AGENT_STOP'],
    });
  });
});
