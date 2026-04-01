/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  getDisplayString,
  AuthType,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  isProModel,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';

interface ModelDialogProps {
  onClose: () => void;
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const settings = useSettings();
  const [hasAccessToProModel, setHasAccessToProModel] = useState<boolean>(
    () => !(config?.getProModelNoAccessSync() ?? false),
  );
  const [view, setView] = useState<'main' | 'manual'>(() =>
    config?.getProModelNoAccessSync() ? 'manual' : 'main',
  );
  const [persistMode, setPersistMode] = useState(false);

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

  const shouldShowPreviewModels = config?.getHasAccessToPreviewModel();
  const useGemini31 = config?.getGemini31LaunchedSync?.() ?? false;
  const useGemini31FlashLite =
    config?.getGemini31FlashLiteLaunchedSync?.() ?? false;
  const selectedAuthType = settings.merged.security.auth.selectedType;
  const useCustomToolModel =
    useGemini31 && selectedAuthType === AuthType.USE_GEMINI;

  const manualModelSelected = useMemo(() => {
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.modelConfigService
    ) {
      const def = config.modelConfigService.getModelDefinition(preferredModel);
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
      return false;
    },
    { isActive: true },
  );

  const mainOptions = useMemo(() => {
    // --- DYNAMIC PATH ---
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.modelConfigService
    ) {
      const list = Object.entries(
        config.modelConfigService.getModelDefinitions?.() ?? {},
      )
        .filter(([_, m]) => {
          // Basic visibility and Preview access
          if (m.isVisible !== true) return false;
          if (m.isPreview && !shouldShowPreviewModels) return false;
          // Only auto models are shown on the main menu
          if (m.tier !== 'auto') return false;
          return true;
        })
        .map(([id, m]) => ({
          value: id,
          title: m.displayName ?? getDisplayString(id, config ?? undefined),
          description:
            id === 'auto-gemini-3' && useGemini31
              ? (m.dialogDescription ?? '').replace(
                  'gemini-3-pro',
                  'gemini-3.1-pro',
                )
              : (m.dialogDescription ?? ''),
          key: id,
        }));

      list.push({
        value: 'Manual',
        title: manualModelSelected
          ? `Manual (${getDisplayString(manualModelSelected, config ?? undefined)})`
          : 'Manual',
        description: 'Manually select a model',
        key: 'Manual',
      });
      return list;
    }

    // --- LEGACY PATH ---
    const list = [
      {
        value: DEFAULT_GEMINI_MODEL_AUTO,
        title: getDisplayString(DEFAULT_GEMINI_MODEL_AUTO),
        description:
          'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
        key: DEFAULT_GEMINI_MODEL_AUTO,
      },
      {
        value: 'Manual',
        title: manualModelSelected
          ? `Manual (${getDisplayString(manualModelSelected)})`
          : 'Manual',
        description: 'Manually select a model',
        key: 'Manual',
      },
    ];

    if (shouldShowPreviewModels) {
      list.unshift({
        value: PREVIEW_GEMINI_MODEL_AUTO,
        title: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
        description: useGemini31
          ? 'Let Gemini CLI decide the best model for the task: gemini-3.1-pro, gemini-3-flash'
          : 'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
        key: PREVIEW_GEMINI_MODEL_AUTO,
      });
    }
    return list;
  }, [config, shouldShowPreviewModels, manualModelSelected, useGemini31]);

  const manualOptions = useMemo(() => {
    // --- DYNAMIC PATH ---
    if (
      config?.getExperimentalDynamicModelConfiguration?.() === true &&
      config.modelConfigService
    ) {
      const list = Object.entries(
        config.modelConfigService.getModelDefinitions?.() ?? {},
      )
        .filter(([id, m]) => {
          // Basic visibility and Preview access
          if (m.isVisible !== true) return false;
          if (m.isPreview && !shouldShowPreviewModels) return false;
          // Auto models are for main menu only
          if (m.tier === 'auto') return false;
          // Pro models are shown for users with pro access
          if (!hasAccessToProModel && m.tier === 'pro') return false;

          // Flag Guard: Versioned models only show if their flag is active.
          if (id === PREVIEW_GEMINI_3_1_MODEL && !useGemini31) return false;
          if (
            id === PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL &&
            !useGemini31FlashLite
          )
            return false;

          return true;
        })
        .map(([id, m]) => {
          const resolvedId = config.modelConfigService.resolveModelId(id, {
            useGemini3_1: useGemini31,
            useGemini3_1FlashLite: useGemini31FlashLite,
            useCustomTools: useCustomToolModel,
          });
          // Title ID is the resolved ID without custom tools flag
          const titleId = config.modelConfigService.resolveModelId(id, {
            useGemini3_1: useGemini31,
            useGemini3_1FlashLite: useGemini31FlashLite,
          });
          return {
            value: resolvedId,
            title:
              m.displayName ?? getDisplayString(titleId, config ?? undefined),
            key: id,
          };
        });

      // Deduplicate: only show one entry per unique resolved model value.
      // This is needed because 3 pro and 3.1 pro models can resolve to the same
      // value, depending on the useGemini31 flag.
      const seen = new Set<string>();
      return list.filter((option) => {
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
      });
    }

    // --- LEGACY PATH ---
    const list = [
      {
        value: DEFAULT_GEMINI_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_MODEL),
        key: DEFAULT_GEMINI_MODEL,
      },
      {
        value: DEFAULT_GEMINI_FLASH_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
        key: DEFAULT_GEMINI_FLASH_MODEL,
      },
      {
        value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        title: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
        key: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      },
    ];

    if (shouldShowPreviewModels) {
      const previewProModel = useGemini31
        ? PREVIEW_GEMINI_3_1_MODEL
        : PREVIEW_GEMINI_MODEL;

      const previewProValue = useCustomToolModel
        ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
        : previewProModel;

      const previewOptions = [
        {
          value: previewProValue,
          title: getDisplayString(previewProModel),
          key: previewProModel,
        },
        {
          value: PREVIEW_GEMINI_FLASH_MODEL,
          title: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
          key: PREVIEW_GEMINI_FLASH_MODEL,
        },
      ];

      if (useGemini31FlashLite) {
        previewOptions.push({
          value: PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
          title: getDisplayString(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL),
          key: PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
        });
      }

      list.unshift(...previewOptions);
    }

    if (!hasAccessToProModel) {
      // Filter out all Pro models for free tier
      return list.filter((option) => !isProModel(option.value));
    }

    return list;
  }, [
    shouldShowPreviewModels,
    useGemini31,
    useGemini31FlashLite,
    useCustomToolModel,
    hasAccessToProModel,
    config,
  ]);

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
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={theme.text.primary}>
            Remember model for future sessions:{' '}
          </Text>
          <Text color={theme.status.success}>
            {persistMode ? 'true' : 'false'}
          </Text>
        </Box>
        <Text color={theme.text.secondary}>(Press Tab to toggle)</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          {'> To use a specific Gemini model on startup, use the --model flag.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
