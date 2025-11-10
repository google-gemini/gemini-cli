/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelConfigServiceConfig } from '../services/modelConfigService.js';

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
            thinkingBudget: -1,
          },
        },
      },
    },
    // Because `gemini-2.5-pro` and related model configs are "user-facing"
    // today, i.e. they could be passed via `--model`, we have to be careful to
    // ensure these model configs can be used interactively.
    // TODO(joshualitt): Introduce internal base configs for the various models,
    // note: we will have to think carefully about names.
    'gemini-2.5-pro': {
      extends: 'chat-base',
      modelConfig: {
        model: 'gemini-2.5-pro',
      },
    },
    'gemini-2.5-flash': {
      extends: 'chat-base',
      modelConfig: {
        model: 'gemini-2.5-flash',
      },
    },
    'gemini-2.5-flash-lite': {
      extends: 'chat-base',
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
    'web-search-tool': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ googleSearch: {} }],
        },
      },
    },
    'web-fetch-tool': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ urlContext: {} }],
        },
      },
    },
    'loop-detection': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'llm-edit-fixer': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
    'next-speaker-checker': {
      extends: 'gemini-2.5-flash-base',
      modelConfig: {},
    },
  },
};
