/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import {
  type ModelPolicyActionMap,
  type ModelPolicyStateMap,
  type ModelPolicyChain,
  type ModelPolicy,
} from './modelPolicy.js';

function definePolicy(config: {
  model: string;
  isLastResort?: boolean;
  actions?: ModelPolicyActionMap;
  stateTransitions?: ModelPolicyStateMap;
}): ModelPolicy {
  return {
    model: config.model,
    isLastResort: config.isLastResort,
    actions: { ...DEFAULT_ACTIONS, ...(config.actions ?? {}) },
    stateTransitions: {
      ...DEFAULT_STATE,
      ...(config.stateTransitions ?? {}),
    },
  };
}

export const DEFAULT_ACTIONS: ModelPolicyActionMap = {
  terminal: 'prompt',
  transient: 'prompt',
  not_found: 'prompt',
  unknown: 'prompt',
};

export const SILENT_ACTIONS: ModelPolicyActionMap = {
  terminal: 'silent',
  transient: 'silent',
  not_found: 'silent',
  unknown: 'silent',
};

export const DEFAULT_STATE: ModelPolicyStateMap = {
  terminal: 'terminal',
  transient: 'terminal',
  not_found: 'terminal',
  unknown: 'terminal',
};

export const DEFAULT_CHAIN: ModelPolicyChain = [
  definePolicy({ model: DEFAULT_GEMINI_MODEL }),
  definePolicy({ model: DEFAULT_GEMINI_FLASH_MODEL, isLastResort: true }),
];

export const PREVIEW_CHAIN: ModelPolicyChain = [
  definePolicy({ model: PREVIEW_GEMINI_MODEL }),
  definePolicy({ model: PREVIEW_GEMINI_FLASH_MODEL, isLastResort: true }),
];

export const FLASH_LITE_CHAIN: ModelPolicyChain = [
  definePolicy({
    model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
    actions: SILENT_ACTIONS,
  }),
  definePolicy({
    model: DEFAULT_GEMINI_FLASH_MODEL,
    actions: SILENT_ACTIONS,
  }),
  definePolicy({
    model: DEFAULT_GEMINI_MODEL,
    isLastResort: true,
    actions: SILENT_ACTIONS,
  }),
];

export const DEFAULT_MODEL_CHAINS: Record<string, ModelPolicyChain> = {
  default: DEFAULT_CHAIN,
  preview: PREVIEW_CHAIN,
  'flash-lite': FLASH_LITE_CHAIN,
};
