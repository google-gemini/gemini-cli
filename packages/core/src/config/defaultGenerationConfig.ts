/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelGenerationServiceConfig } from '../services/modelGenerationConfigService.js';

export const DEFAULT_GENERATION_CONFIG: ModelGenerationServiceConfig = {
  aliases: {
    base: {
      settings: {
        config: {
          temperature: 0,
          topP: 1,
        },
      },
    },
    'chat-base': {
      extends: 'base',
      settings: {
        config: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: -1,
          },
        },
      },
    },
    'gemini-2.5-pro': {
      extends: 'chat-base',
      settings: {
        model: 'gemini-2.5-pro',
      },
    },
    'gemini-2.5-flash': {
      extends: 'chat-base',
      settings: {
        model: 'gemini-2.5-flash',
      },
    },
    'gemini-2.5-flash-lite': {
      extends: 'chat-base',
      settings: {
        model: 'gemini-2.5-flash-lite',
      },
    },
    classifier: {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash-lite',
        config: {
          maxOutputTokens: 1024,
          thinkingConfig: {
            thinkingBudget: 512,
          },
        },
      },
    },
    'prompt-completion': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash-lite',
        config: {
          temperature: 0.3,
          maxOutputTokens: 16000,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      },
    },
    'edit-corrector': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash-lite',
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      },
    },
    'summarizer-default': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash-lite',
        config: {
          maxOutputTokens: 2000,
        },
      },
    },
    'summarizer-shell': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash-lite',
        config: {
          maxOutputTokens: 2000,
        },
      },
    },
    'web-search-tool': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash',
        config: {
          tools: [{ googleSearch: {} }],
        },
      },
    },
    'web-fetch-tool': {
      extends: 'base',
      settings: {
        model: 'gemini-2.5-flash',
        config: {
          tools: [{ urlContext: {} }],
        },
      },
    },
  },
};
