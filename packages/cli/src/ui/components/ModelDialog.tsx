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
  AuthType,
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
        value: 'gemini-2.0-flash',
        title: 'Gemini 2.0 Flash',
        description: 'Gemini 2.0 Flash',
        key: 'gemini-2.0-flash',
      },
      {
        value: 'gemini-2.0-flash-001',
        title: 'Gemini 2.0 Flash 001',
        description:
          'Stable version of Gemini 2.0 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in January of 2025.',
        key: 'gemini-2.0-flash-001',
      },
      {
        value: 'gemini-2.0-flash-exp',
        title: 'Gemini 2.0 Flash Experimental',
        description: 'Gemini 2.0 Flash Experimental',
        key: 'gemini-2.0-flash-exp',
      },
      {
        value: 'gemini-2.0-flash-lite',
        title: 'Gemini 2.0 Flash-Lite',
        description: 'Gemini 2.0 Flash-Lite',
        key: 'gemini-2.0-flash-lite',
      },
      {
        value: 'gemini-2.0-flash-lite-001',
        title: 'Gemini 2.0 Flash-Lite 001',
        description: 'Stable version of Gemini 2.0 Flash-Lite',
        key: 'gemini-2.0-flash-lite-001',
      },
      {
        value: 'gemini-2.0-flash-lite-preview',
        title: 'Gemini 2.0 Flash-Lite Preview',
        description:
          'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite',
        key: 'gemini-2.0-flash-lite-preview',
      },
      {
        value: 'gemini-2.0-flash-lite-preview-02-05',
        title: 'Gemini 2.0 Flash-Lite Preview 02-05',
        description:
          'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite',
        key: 'gemini-2.0-flash-lite-preview-02-05',
      },
      {
        value: 'gemini-2.5-flash',
        title: 'Gemini 2.5 Flash',
        description:
          'Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.',
        key: 'gemini-2.5-flash',
      },
      {
        value: 'gemini-2.5-flash-lite',
        title: 'Gemini 2.5 Flash-Lite',
        description:
          'Stable version of Gemini 2.5 Flash-Lite, released in July of 2025',
        key: 'gemini-2.5-flash-lite',
      },
      {
        value: 'gemini-2.5-flash-lite-preview-09-25',
        title: 'Gemini 2.5 Flash-Lite Preview Sep 2025',
        description:
          'Preview release (Septempber 25th, 2025) of Gemini 2.5 Flash-Lite',
        key: 'gemini-2.5-flash-lite-preview-09-25',
      },
      {
        value: 'gemini-2.5-flash-preview-09-25',
        title: 'Gemini 2.5 Flash Preview Sep 2025',
        description: 'Gemini 2.5 Flash Preview Sep 2025',
        key: 'gemini-2.5-flash-preview-09-25',
      },
      {
        value: 'gemini-2.5-flash-preview-tts',
        title: 'Gemini 2.5 Flash Preview TTS',
        description: 'Gemini 2.5 Flash Preview TTS',
        key: 'gemini-2.5-flash-preview-tts',
      },
      {
        value: 'gemini-2.5-pro',
        title: 'Gemini 2.5 Pro',
        description: 'Stable release (June 17th, 2025) of Gemini 2.5 Pro',
        key: 'gemini-2.5-pro',
      },
      {
        value: 'gemini-2.5-pro-preview-tts',
        title: 'Gemini 2.5 Pro Preview TTS',
        description: 'Gemini 2.5 Pro Preview TTS',
        key: 'gemini-2.5-pro-preview-tts',
      },
      {
        value: 'gemini-3-flash-preview',
        title: 'Gemini 3 Flash Preview',
        description: 'Gemini 3 Flash Preview',
        key: 'gemini-3-flash-preview',
      },
      {
        value: 'gemini-3-pro-preview',
        title: 'Gemini 3 Pro Preview',
        description: 'Gemini 3 Pro Preview',
        key: 'gemini-3-pro-preview',
      },
      {
        value: 'gemini-exp-1206',
        title: 'Gemini Experimental 1206',
        description:
          'Experimental release (March 25th, 2025) of Gemini 2.5 Pro',
        key: 'gemini-exp-1206',
      },
      {
        value: 'gemini-flash-latest',
        title: 'Gemini Flash Latest',
        description: 'Latest release of Gemini Flash',
        key: 'gemini-flash-latest',
      },
      {
        value: 'gemini-flash-lite-latest',
        title: 'Gemini Flash-Lite Latest',
        description: 'Latest release of Gemini Flash-Lite',
        key: 'gemini-flash-lite-latest',
      },
      {
        value: 'gemini-pro-latest',
        title: 'Gemini Pro Latest',
        description: 'Latest release of Gemini Pro',
        key: 'gemini-pro-latest',
      },
      {
        value: 'gemma-3-12b',
        title: 'Gemma 3 12B',
        description: 'Gemma 3 12B',
        key: 'gemma-3-12b',
      },
      {
        value: 'gemma-3-1b',
        title: 'Gemma 3 1B',
        description: 'Gemma 3 1B',
        key: 'gemma-3-1b',
      },
      {
        value: 'gemma-3-27b',
        title: 'Gemma 3 27B',
        description: 'Gemma 3 27B',
        key: 'gemma-3-27b',
      },
      {
        value: 'gemma-3-4b',
        title: 'Gemma 3 4B',
        description: 'Gemma 3 4B',
        key: 'gemma-3-4b',
      },
      {
        value: 'gemma-3n-e2b',
        title: 'Gemma 3n E2B',
        description: 'Gemma 3n E2B',
        key: 'gemma-3n-e2b',
      },
      {
        value: 'gemma-3n-e4b',
        title: 'Gemma 3n E4B',
        description: 'Gemma 3n E4B',
        key: 'gemma-3n-e4b',
      },
      // Fun/Preview models
      {
        value: 'deep-research-pro-preview',
        title: 'Deep Research Pro Preview (Dec-12-2025)',
        description:
          'Preview release (December 12th, 2025) of Deep Research Pro',
        key: 'deep-research-pro-preview',
      },
      {
        value: 'gemini-2.5-computer-use-preview-10-2025',
        title: 'Gemini 2.5 Computer Use Preview 10-2025',
        description: 'Gemini 2.5 Computer Use Preview 10-2025',
        key: 'gemini-2.5-computer-use-preview-10-2025',
      },
      {
        value: 'gemini-2.5-flash-preview-image',
        title: 'Nano Banana (Gemini 2.5 Flash Preview Image)',
        description: 'Gemini 2.5 Flash Preview Image',
        key: 'gemini-2.5-flash-preview-image',
      },
      {
        value: 'gemini-3-pro-image-preview',
        title: 'Nano Banana Pro (Gemini 3 Pro Image Preview)',
        description: 'Gemini 3 Pro Image Preview',
        key: 'gemini-3-pro-image-preview',
      },
      {
        value: 'gemini-robotics-er-1.5-preview',
        title: 'Gemini Robotics-ER 1.5 Preview',
        description: 'Gemini Robotics-ER 1.5 Preview',
        key: 'gemini-robotics-er-1.5-preview',
      },
    ];

    if (shouldShowPreviewModels) {
      list.unshift(
        {
          value: PREVIEW_GEMINI_MODEL,
          title: PREVIEW_GEMINI_MODEL,
          description: 'Preview model',
          key: PREVIEW_GEMINI_MODEL,
        },
        {
          value: PREVIEW_GEMINI_FLASH_MODEL,
          title: PREVIEW_GEMINI_FLASH_MODEL,
          description: 'Preview Flash model',
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
      const authType = config?.getContentGeneratorConfig()?.authType;
      if (authType === AuthType.LOGIN_WITH_GOOGLE) {
        listSourceInfo =
          'Default list (dynamic fetching not supported with Google Login).\nTo use API Key, use the /auth command to switch methods.';
      } else {
        listSourceInfo = 'Default list (could not retrieve from API).';
      }
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
