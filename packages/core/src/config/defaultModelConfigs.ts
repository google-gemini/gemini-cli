/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThinkingLevel } from '@google/genai';
import type { ModelConfigServiceConfig } from '../services/modelConfigService.js';
import { DEFAULT_THINKING_MODE } from './models.js';

// The default model configs. We use `base` as the parent for all of our model
// configs, while `chat-base`, a child of `base`, is the parent of the models
// we use in the "chat" experience.
export const DEFAULT_MODEL_CONFIGS: ModelConfigServiceConfig = {
  aliases: {
    base: {
      modelConfig: {
        generateContentConfig: {
          temperature: 0,
          topP: 1,
        },
      },
    },
    'chat-base': {
      extends: 'base',
      modelConfig: {
        generateContentConfig: {
          thinkingConfig: {
            includeThoughts: true,
          },
          temperature: 1,
          topP: 0.95,
          topK: 64,
        },
      },
    },
    'chat-base-2.5': {
      extends: 'chat-base',
      modelConfig: {
        generateContentConfig: {
          thinkingConfig: {
            thinkingBudget: DEFAULT_THINKING_MODE,
          },
        },
      },
    },
    'chat-base-3': {
      extends: 'chat-base',
      modelConfig: {
        generateContentConfig: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      },
    },
    // Because `gemini-2.5-pro` and related model configs are "user-facing"
    // today, i.e. they could be passed via `--model`, we have to be careful to
    // ensure these model configs can be used interactively.
    // TODO(joshualitt): Introduce internal base configs for the various models,
    // note: we will have to think carefully about names.
    'gemini-3-pro-preview': {
      extends: 'chat-base-3',
      modelConfig: {
        model: 'gemini-3-pro-preview',
      },
    },
    'gemini-3-flash-preview': {
      extends: 'chat-base-3',
      modelConfig: {
        model: 'gemini-3-flash-preview',
      },
    },
    'gemini-2.5-pro': {
      extends: 'chat-base-2.5',
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
    'gemini-2.5-flash': {
      extends: 'chat-base-2.5',
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    'gemini-2.5-flash-lite': {
      extends: 'chat-base-2.5',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
      },
    },
    // Bases for the internal model configs.
    'gemini-2.5-flash-base': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    classifier: {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          maxOutputTokens: 1024,
          thinkingConfig: {
            thinkingBudget: 512,
          },
        },
      },
    },
    'prompt-completion': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
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
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      },
    },
    'summarizer-default': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          maxOutputTokens: 2000,
        },
      },
    },
    'summarizer-shell': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          maxOutputTokens: 2000,
        },
      },
    },
    'web-search': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ googleSearch: {} }],
        },
      },
    },
    'web-fetch': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ urlContext: {} }],
        },
      },
    },
    // TODO(joshualitt): During cleanup, make modelConfig optional.
    'web-fetch-fallback': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'loop-detection': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'loop-detection-double-check': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
    'llm-edit-fixer': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'next-speaker-checker': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'chat-compression-3-pro': {
      modelConfig: {
        model: 'gemini-3-pro-preview',
      },
    },
    'chat-compression-3-flash': {
      modelConfig: {
        model: 'gemini-3-flash-preview',
      },
    },
    'chat-compression-2.5-pro': {
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
    'chat-compression-2.5-flash': {
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    'chat-compression-2.5-flash-lite': {
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
      },
    },
    'chat-compression-default': {
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
  },
  overrides: [
    {
      match: { model: 'chat-base', isRetry: true },
      modelConfig: {
        generateContentConfig: {
          temperature: 1,
        },
      },
    },
  ],
};
