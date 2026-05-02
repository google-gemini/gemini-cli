/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  AuthType,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  getDisplayString,
  isProModel,
} from '@google/gemini-cli-core';

type ModelSelectionTier = 'auto' | 'manual';

export interface AvailableModelOption {
  modelId: string;
  displayName: string;
  description?: string;
  tier: ModelSelectionTier;
}

interface AvailableModelOptionsParams {
  config: Config | undefined;
  selectedAuthType: AuthType | undefined;
  hasAccessToProModel: boolean;
}

export function getAvailableModelOptions({
  config,
  selectedAuthType,
  hasAccessToProModel,
}: AvailableModelOptionsParams): AvailableModelOption[] {
  if (!config) {
    return [];
  }

  const shouldShowPreviewModels = config.getHasAccessToPreviewModel();
  const useGemini31 = config.getGemini31LaunchedSync?.() ?? false;
  const useGemini31FlashLite =
    config.getGemini31FlashLiteLaunchedSync?.() ?? false;
  const useCustomToolModel =
    useGemini31 && selectedAuthType === AuthType.USE_GEMINI;

  if (
    config.getExperimentalDynamicModelConfiguration?.() === true &&
    config.getModelConfigService
  ) {
    const options = config.getModelConfigService().getAvailableModelOptions({
      useGemini3_1: useGemini31,
      useGemini3_1FlashLite: useGemini31FlashLite,
      useCustomTools: useCustomToolModel,
      hasAccessToPreview: shouldShowPreviewModels,
      hasAccessToProModel,
    });

    return options
      .filter((option) => hasAccessToProModel || option.tier !== 'auto')
      .map((option) => ({
        modelId: option.modelId,
        displayName: option.name,
        description: option.description,
        tier: option.tier === 'auto' ? 'auto' : 'manual',
      }));
  }

  const autoOptions: AvailableModelOption[] = [];
  if (hasAccessToProModel && shouldShowPreviewModels) {
    autoOptions.push({
      modelId: PREVIEW_GEMINI_MODEL_AUTO,
      displayName: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
      description: useGemini31
        ? 'Let Gemini CLI decide the best model for the task: gemini-3.1-pro, gemini-3-flash'
        : 'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
      tier: 'auto',
    });
  }

  if (hasAccessToProModel) {
    autoOptions.push({
      modelId: DEFAULT_GEMINI_MODEL_AUTO,
      displayName: getDisplayString(DEFAULT_GEMINI_MODEL_AUTO),
      description:
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
      tier: 'auto',
    });
  }

  const manualOptions: AvailableModelOption[] = [
    {
      modelId: DEFAULT_GEMINI_MODEL,
      displayName: getDisplayString(DEFAULT_GEMINI_MODEL),
      tier: 'manual',
    },
    {
      modelId: DEFAULT_GEMINI_FLASH_MODEL,
      displayName: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
      tier: 'manual',
    },
    {
      modelId: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      displayName: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
      tier: 'manual',
    },
  ];

  if (shouldShowPreviewModels) {
    const previewProModel = useGemini31
      ? PREVIEW_GEMINI_3_1_MODEL
      : PREVIEW_GEMINI_MODEL;
    const previewProValue = useCustomToolModel
      ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
      : previewProModel;

    const previewOptions: AvailableModelOption[] = [
      {
        modelId: previewProValue,
        displayName: getDisplayString(previewProModel),
        tier: 'manual',
      },
      {
        modelId: PREVIEW_GEMINI_FLASH_MODEL,
        displayName: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
        tier: 'manual',
      },
    ];

    if (useGemini31FlashLite) {
      previewOptions.push({
        modelId: PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
        displayName: getDisplayString(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL),
        tier: 'manual',
      });
    }

    manualOptions.unshift(...previewOptions);
  }

  const visibleManualOptions = hasAccessToProModel
    ? manualOptions
    : manualOptions.filter((option) => !isProModel(option.modelId));

  return [...autoOptions, ...visibleManualOptions];
}

export function getAvailableModelIds(
  params: AvailableModelOptionsParams,
): string[] {
  return getAvailableModelOptions(params).map((option) => option.modelId);
}
