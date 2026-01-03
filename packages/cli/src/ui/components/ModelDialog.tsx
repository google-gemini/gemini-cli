/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  getDisplayString,
  type Model,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { ThemedGradient } from './ThemedGradient.js';

interface ModelDialogProps {
  onClose: () => void;
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const [view, setView] = useState<'main' | 'manual'>('main');
  const [fetchedModels, setFetchedModels] = useState<Model[] | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  const shouldShowPreviewModels =
    config?.getPreviewFeatures() && config.getHasAccessToPreviewModel();

  useEffect(() => {
    let mounted = true;
    async function fetchModels() {
      if (!config) return;
      try {
        const models = await config.getContentGenerator().listModels();
        if (mounted) {
          setFetchedModels(models);
          setIsLoading(false);
        }
      } catch {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void fetchModels();
    return () => {
      mounted = false;
    };
  }, [config]);

  const manualModelSelected = useMemo(() => {
    // If we have fetched models, check if the preferred model is in that list
    if (fetchedModels && fetchedModels.length > 0) {
      if (fetchedModels.some((m) => m.name === preferredModel)) {
        return preferredModel;
      }
    } else {
      // Fallback check
      const manualModels = [
        'gemini-pro',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        PREVIEW_GEMINI_MODEL,
        PREVIEW_GEMINI_FLASH_MODEL,
      ];
      if (manualModels.includes(preferredModel)) {
        return preferredModel;
      }
    }
    return '';
  }, [preferredModel, fetchedModels]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (view === 'manual') {
          setView('main');
        } else {
          onClose();
        }
      }
    },
    { isActive: true },
  );

  const mainOptions = useMemo(() => {
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
          ? `Manual (${manualModelSelected})`
          : 'Manual',
        description: 'Manually select a model',
        key: 'Manual',
      },
    ];

    if (shouldShowPreviewModels) {
      list.unshift({
        value: PREVIEW_GEMINI_MODEL_AUTO,
        title: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
        description:
          'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
        key: PREVIEW_GEMINI_MODEL_AUTO,
      });
    }
    return list;
  }, [shouldShowPreviewModels, manualModelSelected]);

  const manualOptions = useMemo(() => {
    // If we successfully fetched models, show them
    if (fetchedModels && fetchedModels.length > 0) {
      // Filter for generateContent support if available info
      const supportedModels = fetchedModels.filter(
        (m) =>
          !m.supportedGenerationMethods ||
          m.supportedGenerationMethods.includes('generateContent'),
      );
      // Sort by name for stability
      supportedModels.sort((a, b) => a.name.localeCompare(b.name));

      return supportedModels.map((m) => ({
        value: m.name,
        title: m.displayName || m.name,
        description: m.description,
        key: m.name,
      }));
    }

    // Fallback default list
    const list = [
      {
        value: 'gemini-2.5-pro',
        title: 'gemini-2.5-pro',
        key: 'gemini-2.5-pro',
      },
      {
        value: 'gemini-2.5-flash',
        title: 'gemini-2.5-flash',
        key: 'gemini-2.5-flash',
      },
      {
        value: 'gemini-1.5-pro',
        title: 'gemini-1.5-pro',
        key: 'gemini-1.5-pro',
      },
      {
        value: 'gemini-1.5-flash',
        title: 'gemini-1.5-flash',
        key: 'gemini-1.5-flash',
      },
    ];

    if (shouldShowPreviewModels) {
      list.unshift(
        {
          value: PREVIEW_GEMINI_MODEL,
          title: PREVIEW_GEMINI_MODEL,
          key: PREVIEW_GEMINI_MODEL,
        },
        {
          value: PREVIEW_GEMINI_FLASH_MODEL,
          title: PREVIEW_GEMINI_FLASH_MODEL,
          key: PREVIEW_GEMINI_FLASH_MODEL,
        },
      );
    }
    return list;
  }, [shouldShowPreviewModels, fetchedModels]);

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
        config.setModel(model);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
      onClose();
    },
    [config, onClose],
  );

  let header;
  let subheader;

  // Do not show any header or subheader since it's already showing preview model
  // options
  if (shouldShowPreviewModels) {
    header = undefined;
    subheader = undefined;
    // When a user has the access but has not enabled the preview features.
  } else if (config?.getHasAccessToPreviewModel()) {
    header = 'Gemini 3 is now available.';
    subheader =
      'Enable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features';
  } else {
    header = 'Gemini 3 is coming soon.';
    subheader = undefined;
  }

  // Add info about model list source
  let listSourceInfo;
  if (view === 'manual') {
    if (isLoading) {
      listSourceInfo = 'Loading models...';
    } else if (fetchedModels && fetchedModels.length > 0) {
      listSourceInfo = 'Active/recent list of available models.';
    } else {
      listSourceInfo = 'Default list (could not retrieve from API).';
    }
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>

      <Box flexDirection="column">
        {header && (
          <Box marginTop={1}>
            <ThemedGradient>
              <Text>{header}</Text>
            </ThemedGradient>
          </Box>
        )}
        {subheader && <Text>{subheader}</Text>}
      </Box>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      {listSourceInfo && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>{listSourceInfo}</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          Applies to this session and future Gemini CLI sessions.
        </Text>
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
