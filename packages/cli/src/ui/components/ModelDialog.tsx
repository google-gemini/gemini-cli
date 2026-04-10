/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ModelQuotaDisplay } from './ModelQuotaDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  getDisplayString,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { getAvailableModelOptions } from '../utils/modelSelection.js';

interface ModelDialogProps {
  onClose: () => void;
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const { settings, setSetting } = useSettingsStore();
  const { terminalWidth } = useUIState();
  const [hasAccessToProModel, setHasAccessToProModel] = useState<boolean>(
    () => !(config?.getProModelNoAccessSync() ?? false),
  );
  const [view, setView] = useState<'main' | 'manual'>(() =>
    config?.getProModelNoAccessSync() ? 'manual' : 'main',
  );
  const [persistMode, setPersistMode] = useState(false);
  const [highlightedModel, setHighlightedModel] = useState<string>(
    config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO,
  );

  const favoriteModels = useMemo(
    () => new Set(settings.merged.model.favorites || []),
    [settings.merged.model.favorites],
  );

  useEffect(() => {
    async function checkAccess() {
      if (!config) return;
      const noAccess = await config.getProModelNoAccess();
      setHasAccessToProModel(!noAccess);
      if (noAccess) {
        setView('manual');
      }
    }
    void checkAccess();
  }, [config]);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  const selectedAuthType = settings.merged.security.auth.selectedType;
  const availableModelOptions = useMemo(
    () =>
      getAvailableModelOptions({
        config: config ?? undefined,
        selectedAuthType,
        hasAccessToProModel,
      }),
    [config, selectedAuthType, hasAccessToProModel],
  );

  const manualModelSelected = useMemo(() => {
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.getModelConfigService
    ) {
      const def = config
        .getModelConfigService()
        .getModelDefinition(preferredModel);
      // Only treat as manual selection if it's a visible, non-auto model.
      return def && def.tier !== 'auto' && def.isVisible === true
        ? preferredModel
        : '';
    }

    const manualModels = [
      DEFAULT_GEMINI_MODEL,
      DEFAULT_GEMINI_FLASH_MODEL,
      DEFAULT_GEMINI_FLASH_LITE_MODEL,
      PREVIEW_GEMINI_MODEL,
      PREVIEW_GEMINI_3_1_MODEL,
      PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
      PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
      PREVIEW_GEMINI_FLASH_MODEL,
    ];
    if (manualModels.includes(preferredModel)) {
      return preferredModel;
    }
    return '';
  }, [preferredModel, config]);

  const toggleFavorite = useCallback(
    (modelId: string) => {
      if (!modelId || modelId === 'Manual') return;
      const newFavorites = new Set(favoriteModels);
      if (newFavorites.has(modelId)) {
        newFavorites.delete(modelId);
      } else {
        newFavorites.add(modelId);
      }
      setSetting(
        SettingScope.User,
        'model.favorites',
        Array.from(newFavorites),
      );
    },
    [favoriteModels, setSetting],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (view === 'manual' && hasAccessToProModel) {
          setView('main');
        } else {
          onClose();
        }
        return true;
      }
      if (key.name === 'tab') {
        setPersistMode((prev) => !prev);
        return true;
      }
      if (key.sequence === 'f') {
        toggleFavorite(highlightedModel);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const mainOptions = useMemo(() => {
    const list = availableModelOptions
      .filter((option) => option.tier === 'auto')
      .map((option) => ({
        value: option.modelId,
        title: `${option.displayName}${favoriteModels.has(option.modelId) ? ' ★' : ''}`,
        description: option.description,
        key: option.modelId,
      }));

    list.push({
      value: 'Manual',
      title: manualModelSelected
        ? `Manual (${getDisplayString(manualModelSelected, config ?? undefined)})${favoriteModels.has(manualModelSelected) ? ' ★' : ''}`
        : 'Manual',
      description: 'Manually select a model',
      key: 'Manual',
    });

    return list;
  }, [availableModelOptions, manualModelSelected, config, favoriteModels]);

  const manualOptions = useMemo(() => availableModelOptions
      .filter((option) => option.tier !== 'auto')
      .map((option) => ({
        value: option.modelId,
        title: `${option.displayName}${favoriteModels.has(option.modelId) ? ' ★' : ''}`,
        key: option.modelId,
      })), [availableModelOptions, favoriteModels]);

  const options = view === 'main' ? mainOptions : manualOptions;

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(() => {
    const idx = options.findIndex((option) => option.value === preferredModel);
    if (idx !== -1) {
      return idx;
    }
    if (view === 'main') {
      const manualIdx = options.findIndex((o) => o.value === 'Manual');
      return manualIdx !== -1 ? manualIdx : 0;
    }
    return 0;
  }, [preferredModel, options, view]);

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback(
    (model: string) => {
      if (model === 'Manual') {
        setView('manual');
        return;
      }

      if (config) {
        config.setModel(model, persistMode ? false : true);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
      onClose();
    },
    [config, onClose, persistMode],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>

      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          onHighlight={setHighlightedModel}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold color={theme.text.primary}>
            Remember model for future sessions:{' '}
          </Text>
          <Text color={theme.status.success}>
            {persistMode ? 'true' : 'false'}
          </Text>
          <Text color={theme.text.secondary}> (Press Tab to toggle)</Text>
        </Box>
        <Box>
          <Text color={theme.text.secondary}>
            Press <Text bold>f</Text> to favorite/unfavorite the highlighted
            model.
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>
          {'> To use a specific Gemini model on startup, use the --model flag.'}
        </Text>
      </Box>
      <ModelQuotaDisplay
        buckets={config?.getLastRetrievedQuota()?.buckets}
        availableWidth={terminalWidth - 2}
      />
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
