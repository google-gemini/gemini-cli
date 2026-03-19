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
    'gemini-3-flash-base': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-3-flash-preview',
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
    'fast-ack-helper': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-2.5-flash-lite',
        generateContentConfig: {
          temperature: 0.2,
          maxOutputTokens: 120,
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
      extends: 'gemini-3-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ googleSearch: {} }],
        },
      },
    },
    'web-fetch': {
      extends: 'gemini-3-flash-base',
      modelConfig: {
        generateContentConfig: {
          tools: [{ urlContext: {} }],
        },
      },
    },
    // TODO(joshualitt): During cleanup, make modelConfig optional.
    'web-fetch-fallback': {
      extends: 'gemini-3-flash-base',
      modelConfig: {},
    },
    'loop-detection': {
      extends: 'gemini-3-flash-base',
      modelConfig: {},
    },
    'loop-detection-double-check': {
      extends: 'base',
      modelConfig: {
        model: 'gemini-3-pro-preview',
      },
    },
    'llm-edit-fixer': {
      extends: 'gemini-3-flash-base',
      modelConfig: {},
    },
    'next-speaker-checker': {
      extends: 'gemini-3-flash-base',
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
        model: 'gemini-3-pro-preview',
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
  modelDefinitions: {
    // Concrete Models
    'gemini-3.1-flash-lite-preview': {
      tier: 'flash-lite',
      family: 'gemini-3',
      isPreview: true,
      isVisible: true,
      features: { thinking: false, multimodalToolUse: true },
    },
    'gemini-3.1-pro-preview': {
      tier: 'pro',
      family: 'gemini-3',
      isPreview: true,
      isVisible: true,
      features: { thinking: true, multimodalToolUse: true },
    },
    'gemini-3.1-pro-preview-customtools': {
      tier: 'pro',
      family: 'gemini-3',
      isPreview: true,
      isVisible: false,
      features: { thinking: true, multimodalToolUse: true },
    },
    'gemini-3-pro-preview': {
      tier: 'pro',
      family: 'gemini-3',
      isPreview: true,
      isVisible: true,
      features: { thinking: true, multimodalToolUse: true },
    },
    'gemini-3-flash-preview': {
      tier: 'flash',
      family: 'gemini-3',
      isPreview: true,
      isVisible: true,
      features: { thinking: false, multimodalToolUse: true },
    },
    'gemini-2.5-pro': {
      tier: 'pro',
      family: 'gemini-2.5',
      isPreview: false,
      isVisible: true,
      features: { thinking: false, multimodalToolUse: false },
    },
    'gemini-2.5-flash': {
      tier: 'flash',
      family: 'gemini-2.5',
      isPreview: false,
      isVisible: true,
      features: { thinking: false, multimodalToolUse: false },
    },
    'gemini-2.5-flash-lite': {
      tier: 'flash-lite',
      family: 'gemini-2.5',
      isPreview: false,
      isVisible: true,
      features: { thinking: false, multimodalToolUse: false },
    },
    // Aliases
    auto: {
      tier: 'auto',
      isPreview: true,
      isVisible: false,
      features: { thinking: true, multimodalToolUse: false },
    },
    pro: {
      tier: 'pro',
      isPreview: false,
      isVisible: false,
      features: { thinking: true, multimodalToolUse: false },
    },
    flash: {
      tier: 'flash',
      isPreview: false,
      isVisible: false,
      features: { thinking: false, multimodalToolUse: false },
    },
    'flash-lite': {
      tier: 'flash-lite',
      isPreview: false,
      isVisible: false,
      features: { thinking: false, multimodalToolUse: false },
    },
    'auto-gemini-3': {
      displayName: 'Auto (Gemini 3)',
      tier: 'auto',
      isPreview: true,
      isVisible: true,
      dialogDescription:
        'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
      features: { thinking: true, multimodalToolUse: false },
    },
    'auto-gemini-2.5': {
      displayName: 'Auto (Gemini 2.5)',
      tier: 'auto',
      isPreview: false,
      isVisible: true,
      dialogDescription:
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
      features: { thinking: false, multimodalToolUse: false },
    },
  },
  modelIdResolutions: {
    'gemini-3.1-pro-preview': {
      default: 'gemini-3.1-pro-preview',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
      ],
    },
    'gemini-3.1-pro-preview-customtools': {
      default: 'gemini-3.1-pro-preview-customtools',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
      ],
    },
    'gemini-3-flash-preview': {
      default: 'gemini-3-flash-preview',
      contexts: [
        {
          condition: { hasAccessToPreview: false },
          target: 'gemini-2.5-flash',
        },
      ],
    },
    'gemini-3-pro-preview': {
      default: 'gemini-3-pro-preview',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
        {
          condition: { useGemini3_1: true, useCustomTools: true },
          target: 'gemini-3.1-pro-preview-customtools',
        },
        {
          condition: { useGemini3_1: true },
          target: 'gemini-3.1-pro-preview',
        },
      ],
    },
    'auto-gemini-3': {
      default: 'gemini-3-pro-preview',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
        {
          condition: { useGemini3_1: true, useCustomTools: true },
          target: 'gemini-3.1-pro-preview-customtools',
        },
        {
          condition: { useGemini3_1: true },
          target: 'gemini-3.1-pro-preview',
        },
      ],
    },
    auto: {
      default: 'gemini-3-pro-preview',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
        {
          condition: { useGemini3_1: true, useCustomTools: true },
          target: 'gemini-3.1-pro-preview-customtools',
        },
        {
          condition: { useGemini3_1: true },
          target: 'gemini-3.1-pro-preview',
        },
      ],
    },
    pro: {
      default: 'gemini-3-pro-preview',
      contexts: [
        { condition: { hasAccessToPreview: false }, target: 'gemini-2.5-pro' },
        {
          condition: { useGemini3_1: true, useCustomTools: true },
          target: 'gemini-3.1-pro-preview-customtools',
        },
        {
          condition: { useGemini3_1: true },
          target: 'gemini-3.1-pro-preview',
        },
      ],
    },
    'auto-gemini-2.5': {
      default: 'gemini-2.5-pro',
    },
    flash: {
      default: 'gemini-3-flash-preview',
      contexts: [
        {
          condition: { hasAccessToPreview: false },
          target: 'gemini-2.5-flash',
        },
      ],
    },
    'flash-lite': {
      default: 'gemini-2.5-flash-lite',
    },
  },
  classifierIdResolutions: {
    flash: {
      default: 'gemini-3-flash-preview',
      contexts: [
        {
          condition: { requestedModels: ['auto-gemini-2.5', 'gemini-2.5-pro'] },
          target: 'gemini-2.5-flash',
        },
        {
          condition: {
            requestedModels: ['auto-gemini-3', 'gemini-3-pro-preview'],
          },
          target: 'gemini-3-flash-preview',
        },
      ],
    },
    pro: {
      default: 'gemini-3-pro-preview',
      contexts: [
        {
          condition: { requestedModels: ['auto-gemini-2.5', 'gemini-2.5-pro'] },
          target: 'gemini-2.5-pro',
        },
        {
          condition: { useGemini3_1: true, useCustomTools: true },
          target: 'gemini-3.1-pro-preview-customtools',
        },
        {
          condition: { useGemini3_1: true },
          target: 'gemini-3.1-pro-preview',
        },
      ],
    },
  },
  modelChains: {
    preview: [
      {
        model: 'gemini-3-pro-preview',
        actions: {
          terminal: 'prompt',
          transient: 'prompt',
          not_found: 'prompt',
          unknown: 'prompt',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
      {
        model: 'gemini-3-flash-preview',
        isLastResort: true,
        actions: {
          terminal: 'prompt',
          transient: 'prompt',
          not_found: 'prompt',
          unknown: 'prompt',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
    ],
    default: [
      {
        model: 'gemini-2.5-pro',
        actions: {
          terminal: 'prompt',
          transient: 'prompt',
          not_found: 'prompt',
          unknown: 'prompt',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
      {
        model: 'gemini-2.5-flash',
        isLastResort: true,
        actions: {
          terminal: 'prompt',
          transient: 'prompt',
          not_found: 'prompt',
          unknown: 'prompt',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
    ],
    lite: [
      {
        model: 'gemini-2.5-flash-lite',
        actions: {
          terminal: 'silent',
          transient: 'silent',
          not_found: 'silent',
          unknown: 'silent',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
      {
        model: 'gemini-2.5-flash',
        actions: {
          terminal: 'silent',
          transient: 'silent',
          not_found: 'silent',
          unknown: 'silent',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
      {
        model: 'gemini-2.5-pro',
        isLastResort: true,
        actions: {
          terminal: 'silent',
          transient: 'silent',
          not_found: 'silent',
          unknown: 'silent',
        },
        stateTransitions: {
          terminal: 'terminal',
          transient: 'terminal',
          not_found: 'terminal',
          unknown: 'terminal',
        },
      },
    ],
  },
};
