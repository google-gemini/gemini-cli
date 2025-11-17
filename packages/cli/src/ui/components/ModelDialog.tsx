/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_PRO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { ThemedGradient } from './ThemedGradient.js';

interface ModelDialogProps {
  onClose: () => void;
}



interface PersistModelPromptProps {
  selectedModel: string;
  onPersist: (model: string) => void;
  onNoPersist: (model: string) => void;
  onClose: () => void;
}

function PersistModelPrompt({
  selectedModel,
  onPersist,
  onNoPersist,
  onClose,
}: PersistModelPromptProps): React.JSX.Element {
  const handlePersist = useCallback(() => {
    onPersist(selectedModel);
    onClose();
  }, [onPersist, selectedModel, onClose]);

  const handleNoPersist = useCallback(() => {
    onNoPersist(selectedModel);
    onClose();
  }, [onNoPersist, selectedModel, onClose]);

  const options = useMemo(
    () => [
      {
        value: 'yes',
        title: 'Yes',
        description: 'Save for future sessions',
        key: 'yes',
      },
      {
        value: 'no',
        title: 'No',
        description: 'Apply to current session only',
        key: 'no',
      },
    ],
    [],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>
        Do you want to save &quot;{selectedModel}&quot; for future sessions?
      </Text>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={(value) =>
            value === 'yes' ? handlePersist() : handleNoPersist()
          }
          initialIndex={0}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const [showPersistPrompt, setShowPersistPrompt] = useState(false);
  const [tempSelectedModel, setTempSelectedModel] = useState<string | null>(
    null,
  );

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || DEFAULT_GEMINI_MODEL_AUTO;

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
    },
    { isActive: true },
  );

  const options = useMemo(
    () => [
      {
        value: DEFAULT_GEMINI_MODEL_AUTO,
        title: 'Auto',
        description: 'Let the system choose the best model for your task.',
        key: DEFAULT_GEMINI_MODEL_AUTO,
      },
      {
        value: GEMINI_MODEL_ALIAS_PRO,
        title: config?.getPreviewFeatures()
          ? `Pro (${PREVIEW_GEMINI_MODEL}, ${DEFAULT_GEMINI_MODEL})`
          : `Pro (${DEFAULT_GEMINI_MODEL})`,
        description:
          'For complex tasks that require deep reasoning and creativity',
        key: GEMINI_MODEL_ALIAS_PRO,
      },
      {
        value: GEMINI_MODEL_ALIAS_FLASH,
        title: `Flash (${DEFAULT_GEMINI_FLASH_MODEL})`,
        description: 'For tasks that need a balance of speed and reasoning',
        key: GEMINI_MODEL_ALIAS_FLASH,
      },
      {
        value: GEMINI_MODEL_ALIAS_FLASH_LITE,
        title: `Flash-Lite (${DEFAULT_GEMINI_FLASH_LITE_MODEL})`,
        description: 'For simple tasks that need to be done quickly',
        key: GEMINI_MODEL_ALIAS_FLASH_LITE,
      },
    ],
    [config],
  );

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(
    () => options.findIndex((option) => option.value === preferredModel),
    [preferredModel, options],
  );

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback((model: string) => {
    setTempSelectedModel(model);
    setShowPersistPrompt(true);
  }, []);

  const handlePersist = useCallback(
    (model: string) => {
      if (config) {
        config.setModel(model, true);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
    },
    [config],
  );

  const header = config?.getPreviewFeatures()
    ? 'Gemini 3 is now enabled.'
    : 'Gemini 3 is now available.';

  const subheader = config?.getPreviewFeatures()
    ? `To disable Gemini 3, disable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features\n\nWhen you select Auto or Pro, Gemini CLI will attempt to use ${PREVIEW_GEMINI_MODEL} first, before falling back to ${DEFAULT_GEMINI_MODEL}.`
    : `To use Gemini 3, enable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features`;

  const handleNoPersist = useCallback(
    (model: string) => {
      if (config) {
        config.setModel(model, false);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }
    },
    [config],
  );

  if (showPersistPrompt && tempSelectedModel) {
    return (
      <PersistModelPrompt
        selectedModel={tempSelectedModel}
        onPersist={handlePersist}
        onNoPersist={handleNoPersist}
        onClose={onClose}
      />
    );
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

      <Box marginTop={1} marginBottom={1} flexDirection="column">
        <ThemedGradient>
          <Text>{header}</Text>
        </ThemedGradient>
        <Text>{subheader}</Text>
      </Box>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          Applies to this session and future Gemini CLI sessions.
        </Text>
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
