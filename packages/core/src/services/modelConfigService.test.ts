/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { ModelConfigServiceConfig } from './modelConfigService.js';
import { ModelConfigService } from './modelConfigService.js';

describe('ModelConfigService', () => {
  it('should resolve a basic alias to its model and settings', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {
        classifier: {
          modelConfig: {
            model: 'gemini-1.5-flash-latest',
            generateContentConfig: {
              temperature: 0,
              topP: 0.9,
            },
          },
        },
      },
      overrides: [],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({ model: 'classifier' });

    expect(resolved.model).toBe('gemini-1.5-flash-latest');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0,
      topP: 0.9,
    });
  });

  it('should apply a simple override on top of an alias', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {
        classifier: {
          modelConfig: {
            model: 'gemini-1.5-flash-latest',
            generateContentConfig: {
              temperature: 0,
              topP: 0.9,
            },
          },
        },
      },
      overrides: [
        {
          match: { model: 'classifier' },
          modelConfig: {
            generateContentConfig: {
              temperature: 0.5,
              maxOutputTokens: 1000,
            },
          },
        },
      ],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({ model: 'classifier' });

    expect(resolved.model).toBe('gemini-1.5-flash-latest');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 1000,
    });
  });

  it('should apply the most specific override rule', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {},
      overrides: [
        {
          match: { model: 'gemini-pro' },
          modelConfig: { generateContentConfig: { temperature: 0.5 } },
        },
        {
          match: { model: 'gemini-pro', overrideScope: 'my-agent' },
          modelConfig: { generateContentConfig: { temperature: 0.1 } },
        },
      ],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({
      model: 'gemini-pro',
      overrideScope: 'my-agent',
    });

    expect(resolved.model).toBe('gemini-pro');
    expect(resolved.generateContentConfig).toEqual({ temperature: 0.1 });
  });

  it('should use the last override in case of a tie in specificity', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {},
      overrides: [
        {
          match: { model: 'gemini-pro' },
          modelConfig: {
            generateContentConfig: { temperature: 0.5, topP: 0.8 },
          },
        },
        {
          match: { model: 'gemini-pro' },
          modelConfig: { generateContentConfig: { temperature: 0.1 } },
        },
      ],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({ model: 'gemini-pro' });

    expect(resolved.model).toBe('gemini-pro');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.1,
      topP: 0.8,
    });
  });

  it('should correctly pass through generation config from an alias', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {
        'thinking-alias': {
          modelConfig: {
            model: 'gemini-pro',
            generateContentConfig: {
              candidateCount: 500,
            },
          },
        },
      },
      overrides: [],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({ model: 'thinking-alias' });

    expect(resolved.generateContentConfig).toEqual({ candidateCount: 500 });
  });

  it('should let an override generation config win over an alias config', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {
        'thinking-alias': {
          modelConfig: {
            model: 'gemini-pro',
            generateContentConfig: {
              candidateCount: 500,
            },
          },
        },
      },
      overrides: [
        {
          match: { model: 'thinking-alias' },
          modelConfig: {
            generateContentConfig: {
              candidateCount: 1000,
            },
          },
        },
      ],
    };
    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({ model: 'thinking-alias' });

    expect(resolved.generateContentConfig).toEqual({
      candidateCount: 1000,
    });
  });

  it('should merge settings from global, alias, and multiple matching overrides', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {
        'test-alias': {
          modelConfig: {
            model: 'gemini-test-model',
            generateContentConfig: {
              topP: 0.9,
              topK: 50,
            },
          },
        },
      },
      overrides: [
        {
          match: { model: 'gemini-test-model' },
          modelConfig: {
            generateContentConfig: {
              topK: 40,
              maxOutputTokens: 2048,
            },
          },
        },
        {
          match: { overrideScope: 'test-agent' },
          modelConfig: {
            generateContentConfig: {
              maxOutputTokens: 4096,
            },
          },
        },
        {
          match: { model: 'gemini-test-model', overrideScope: 'test-agent' },
          modelConfig: {
            generateContentConfig: {
              temperature: 0.2,
            },
          },
        },
      ],
    };

    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({
      model: 'test-alias',
      overrideScope: 'test-agent',
    });

    expect(resolved.model).toBe('gemini-test-model');
    expect(resolved.generateContentConfig).toEqual({
      // From global, overridden by most specific override
      temperature: 0.2,
      // From alias, not overridden
      topP: 0.9,
      // From alias, overridden by less specific override
      topK: 40,
      // From first matching override, overridden by second matching override
      maxOutputTokens: 4096,
    });
  });

  it('should match an agent:core override when agent is undefined', () => {
    const config: ModelConfigServiceConfig = {
      aliases: {},
      overrides: [
        {
          match: { overrideScope: 'core' },
          modelConfig: {
            generateContentConfig: {
              temperature: 0.1,
            },
          },
        },
      ],
    };

    const service = new ModelConfigService(config);
    const resolved = service.getResolvedConfig({
      model: 'gemini-pro',
      overrideScope: undefined, // Explicitly undefined
    });

    expect(resolved.model).toBe('gemini-pro');
    expect(resolved.generateContentConfig).toEqual({
      temperature: 0.1,
    });
  });

  describe('alias inheritance', () => {
    it('should resolve a simple "extends" chain', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          base: {
            modelConfig: {
              model: 'gemini-1.5-pro-latest',
              generateContentConfig: {
                temperature: 0.7,
                topP: 0.9,
              },
            },
          },
          'flash-variant': {
            extends: 'base',
            modelConfig: {
              model: 'gemini-1.5-flash-latest',
            },
          },
        },
      };
      const service = new ModelConfigService(config);
      const resolved = service.getResolvedConfig({ model: 'flash-variant' });

      expect(resolved.model).toBe('gemini-1.5-flash-latest');
      expect(resolved.generateContentConfig).toEqual({
        temperature: 0.7,
        topP: 0.9,
      });
    });

    it('should override parent properties from child alias', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          base: {
            modelConfig: {
              model: 'gemini-1.5-pro-latest',
              generateContentConfig: {
                temperature: 0.7,
                topP: 0.9,
              },
            },
          },
          'flash-variant': {
            extends: 'base',
            modelConfig: {
              model: 'gemini-1.5-flash-latest',
              generateContentConfig: {
                temperature: 0.2,
              },
            },
          },
        },
      };
      const service = new ModelConfigService(config);
      const resolved = service.getResolvedConfig({ model: 'flash-variant' });

      expect(resolved.model).toBe('gemini-1.5-flash-latest');
      expect(resolved.generateContentConfig).toEqual({
        temperature: 0.2,
        topP: 0.9,
      });
    });

    it('should resolve a multi-level "extends" chain', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          base: {
            modelConfig: {
              model: 'gemini-1.5-pro-latest',
              generateContentConfig: {
                temperature: 0.7,
                topP: 0.9,
              },
            },
          },
          'base-flash': {
            extends: 'base',
            modelConfig: {
              model: 'gemini-1.5-flash-latest',
            },
          },
          'classifier-flash': {
            extends: 'base-flash',
            modelConfig: {
              generateContentConfig: {
                temperature: 0,
              },
            },
          },
        },
      };
      const service = new ModelConfigService(config);
      const resolved = service.getResolvedConfig({
        model: 'classifier-flash',
      });

      expect(resolved.model).toBe('gemini-1.5-flash-latest');
      expect(resolved.generateContentConfig).toEqual({
        temperature: 0,
        topP: 0.9,
      });
    });

    it('should throw an error for circular dependencies', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          a: { extends: 'b', modelConfig: {} },
          b: { extends: 'a', modelConfig: {} },
        },
      };
      const service = new ModelConfigService(config);
      expect(() => service.getResolvedConfig({ model: 'a' })).toThrow(
        'Circular alias dependency: a -> b -> a',
      );
    });

    describe('abstract aliases', () => {
      it('should allow an alias to extend an abstract alias without a model', () => {
        const config: ModelConfigServiceConfig = {
          aliases: {
            'abstract-base': {
              modelConfig: {
                generateContentConfig: {
                  temperature: 0.1,
                },
              },
            },
            'concrete-child': {
              extends: 'abstract-base',
              modelConfig: {
                model: 'gemini-1.5-pro-latest',
                generateContentConfig: {
                  topP: 0.9,
                },
              },
            },
          },
        };
        const service = new ModelConfigService(config);
        const resolved = service.getResolvedConfig({ model: 'concrete-child' });

        expect(resolved.model).toBe('gemini-1.5-pro-latest');
        expect(resolved.generateContentConfig).toEqual({
          temperature: 0.1,
          topP: 0.9,
        });
      });

      it('should throw an error if a resolved alias chain has no model', () => {
        const config: ModelConfigServiceConfig = {
          aliases: {
            'abstract-base': {
              modelConfig: {
                generateContentConfig: { temperature: 0.7 },
              },
            },
          },
        };
        const service = new ModelConfigService(config);
        expect(() =>
          service.getResolvedConfig({ model: 'abstract-base' }),
        ).toThrow(
          'Could not resolve a model name for alias "abstract-base". Please ensure the alias chain or a matching override specifies a model.',
        );
      });

      it('should resolve an abstract alias if an override provides the model', () => {
        const config: ModelConfigServiceConfig = {
          aliases: {
            'abstract-base': {
              modelConfig: {
                generateContentConfig: {
                  temperature: 0.1,
                },
              },
            },
          },
          overrides: [
            {
              match: { model: 'abstract-base' },
              modelConfig: {
                model: 'gemini-1.5-flash-latest',
              },
            },
          ],
        };
        const service = new ModelConfigService(config);
        const resolved = service.getResolvedConfig({ model: 'abstract-base' });

        expect(resolved.model).toBe('gemini-1.5-flash-latest');
        expect(resolved.generateContentConfig).toEqual({
          temperature: 0.1,
        });
      });
    });

    it('should throw an error if an extended alias does not exist', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          'bad-alias': {
            extends: 'non-existent',
            modelConfig: {},
          },
        },
      };
      const service = new ModelConfigService(config);
      expect(() => service.getResolvedConfig({ model: 'bad-alias' })).toThrow(
        'Alias "non-existent" not found.',
      );
    });
  });

  describe('deep merging', () => {
    it('should deep merge nested config objects from aliases and overrides', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          'base-safe': {
            modelConfig: {
              model: 'gemini-pro',
              generateContentConfig: {
                safetySettings: {
                  HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
                  HARM_CATEGORY_HATE_SPEECH: 'BLOCK_ONLY_HIGH',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
              },
            },
          },
        },
        overrides: [
          {
            match: { model: 'base-safe' },
            modelConfig: {
              generateContentConfig: {
                safetySettings: {
                  HARM_CATEGORY_HATE_SPEECH: 'BLOCK_NONE',
                  HARM_CATEGORY_SEXUALLY_EXPLICIT: 'BLOCK_MEDIUM_AND_ABOVE',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
              },
            },
          },
        ],
      };
      const service = new ModelConfigService(config);
      const resolved = service.getResolvedConfig({ model: 'base-safe' });

      expect(resolved.model).toBe('gemini-pro');
      expect(resolved.generateContentConfig.safetySettings).toEqual({
        // From alias
        HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
        // From alias, overridden by override
        HARM_CATEGORY_HATE_SPEECH: 'BLOCK_NONE',
        // From override
        HARM_CATEGORY_SEXUALLY_EXPLICIT: 'BLOCK_MEDIUM_AND_ABOVE',
      });
    });

    it('should not deeply merge merge arrays from aliases and overrides', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          base: {
            modelConfig: {
              model: 'gemini-pro',
              generateContentConfig: {
                stopSequences: ['foo'],
              },
            },
          },
        },
        overrides: [
          {
            match: { model: 'base' },
            modelConfig: {
              generateContentConfig: {
                stopSequences: ['overrideFoo'],
              },
            },
          },
        ],
      };
      const service = new ModelConfigService(config);
      const resolved = service.getResolvedConfig({ model: 'base' });

      expect(resolved.model).toBe('gemini-pro');
      expect(resolved.generateContentConfig.stopSequences).toEqual([
        'overrideFoo',
      ]);
    });
  });
});
