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
): SupportedGeminiModel | undefined {
  if (!value) return undefined;
  if (!isSupportedModel(value)) {
    logs.push(`Loading ${label} "${value}" failed, not a valid model name.`);
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
  const chosen =
    tryPick('--model', argv.model, logs) ??
    tryPick('settings.json', settings.model, logs) ??
    tryPick('$GEMINI_MODEL', envModel, logs) ??
    defaultModel;

  const hadFailure = logs.some((l) => l.includes('failed'));
  logs.push(`Using model ${chosen}`);
  return { model: chosen, logs, hadFailure };
}
