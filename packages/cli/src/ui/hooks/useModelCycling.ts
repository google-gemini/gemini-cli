/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import {
  DEFAULT_GEMINI_MODEL_AUTO,
  getDisplayString,
  coreEvents,
} from '@google/gemini-cli-core';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useKeypress } from './useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from './useKeyMatchers.js';
import { formatCommand } from '../key/keybindingUtils.js';
import { getAvailableModelIds } from '../utils/modelSelection.js';

export function useModelCycling() {
  const config = useConfig();
  const { merged: settings } = useSettings();
  const keyMatchers = useKeyMatchers();

  const getAvailableModels = useCallback(
    () =>
      getAvailableModelIds({
        config,
        selectedAuthType: settings.security.auth.selectedType,
        hasAccessToProModel: !(config?.getProModelNoAccessSync() ?? false),
      }),
    [config, settings.security.auth.selectedType],
  );

  const cycleModels = useCallback(
    (direction: 'forward' | 'backward') => {
      const availableModels = getAvailableModels();
      if (availableModels.length === 0) return;
      if (!config) return;

      const favoriteModels = settings.model.favorites || [];
      const cycleList =
        favoriteModels.length > 0
          ? availableModels.filter((id) => favoriteModels.includes(id))
          : availableModels;

      if (cycleList.length === 0) return;

      const currentModel = config.getModel() || DEFAULT_GEMINI_MODEL_AUTO;
      let currentIndex = cycleList.indexOf(currentModel);

      // If current model is not in the cycle list (e.g. it was just unfavorited),
      // we can't easily find "next". Let's just pick the first one or find nearest.
      if (currentIndex === -1) {
        currentIndex = 0;
      } else {
        if (direction === 'forward') {
          currentIndex = (currentIndex + 1) % cycleList.length;
        } else {
          currentIndex =
            (currentIndex - 1 + cycleList.length) % cycleList.length;
        }
      }

      const nextModel = cycleList[currentIndex];
      if (nextModel !== currentModel) {
        config.setModel(nextModel, true);
        const cycleHint = formatCommand(Command.CYCLE_MODELS_FORWARD);
        coreEvents.emitFeedback(
          'info',
          'Switched to model: ' +
            (getDisplayString(nextModel, config)?.trim() || 'Unknown Model') +
            ' (Press ' +
            cycleHint +
            ' to cycle)',
        );
      }
    },
    [config, getAvailableModels, settings.model.favorites],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.CYCLE_MODELS_FORWARD](key)) {
        cycleModels('forward');
        return true;
      }
      if (keyMatchers[Command.CYCLE_MODELS_BACKWARD](key)) {
        cycleModels('backward');
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return { cycleModels };
}
