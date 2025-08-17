/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_MODEL,
  isSupportedModel,
  type SupportedGeminiModel,
} from '@google/gemini-cli-core';
import type { CliArgs } from './config.js';
import type { Settings } from './settings.js';

function tryPick(
  label: string,
  value: string | undefined,
  logs: string[],
  failure: { value: boolean },
): SupportedGeminiModel | undefined {
  if (!value) return undefined;
  if (!isSupportedModel(value)) {
    logs.push(`Loading ${label} "${value}" failed, not a valid model name.`);
    failure.value = true;
    return undefined;
  }
  return value;
}

export function selectModel(
  argv: CliArgs,
  settings: Settings,
  envModel = process.env.GEMINI_MODEL,
  defaultModel: SupportedGeminiModel = DEFAULT_GEMINI_MODEL as SupportedGeminiModel,
): { model: SupportedGeminiModel; logs: string[]; hadFailure: boolean } {
  const logs: string[] = [];
  const failure = { value: false };
  const chosen =
    tryPick('--model', argv.model, logs, failure) ??
    tryPick('settings.json', settings.model, logs, failure) ??
    tryPick('$GEMINI_MODEL', envModel, logs, failure) ??
    defaultModel;

  const hadFailure = failure.value;
  logs.push(`Using model ${chosen}`);
  return { model: chosen, logs, hadFailure };
}
