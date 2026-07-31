/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { isBinaryAvailable } from '@google/gemini-cli-core';
import {
  WhisperModelManager,
  type WhisperModelProgress,
} from '@google/gemini-cli-core';
import { CliSpinner } from './CliSpinner.js';
import { WarningMessage } from './messages/WarningMessage.js';

interface VoiceModelDialogProps {
  onClose: () => void;
}

type DialogView = 'backend' | 'whisper-models';

const WHISPER_MODELS = [
  {
    value: 'ggml-tiny.en.bin',
    label: 'Tiny (EN)',
    description: 'Fastest, lower accuracy (~75MB)',
  },
  {
    value: 'ggml-base.en.bin',
    label: 'Base (EN)',
    description: 'Balanced speed and accuracy (~142MB)',
  },
  {
    value: 'ggml-large-v3-turbo-q5_0.bin',
    label: 'Large v3 Turbo (Q5_0)',
    description: 'High accuracy, quantized (~547MB)',
  },
  {
    value: 'ggml-large-v3-turbo-q8_0.bin',
    label: 'Large v3 Turbo (Q8_0)',
    description: 'Maximum accuracy, high memory (~834MB)',
  },
];

export function VoiceModelDialog({
  onClose,
}: VoiceModelDialogProps): React.JSX.Element {
  const { settings, setSetting } = useSettingsStore();
  const [view, setView] = useState<DialogView>('backend');
  const [downloadProgress, setDownloadProgress] =
    useState<WhisperModelProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const whisperInstalled = useMemo(
    () => isBinaryAvailable('whisper-stream'),
    [],
  );
  const modelManager = useMemo(() => new WhisperModelManager(), []);

  const currentBackend =
    settings.merged.experimental.voice?.backend ?? 'gemini-live';
  const currentWhisperModel =
    settings.merged.experimental.voice?.whisperModel ?? 'ggml-base.en.bin';

  const [highlightedBackend, setHighlightedBackend] =
    useState<string>(currentBackend);

  const handleKeypress = useCallback(
    (key: Key) => {
      if (key.name === 'escape') {
        if (view === 'whisper-models') {
          setView('backend');
        } else {
          onClose();
        }
        return true;
      }
      return false;
    },
    [view, onClose],
  );

  useKeypress(handleKeypress, { isActive: true });

  const handleBackendSelect = useCallback(
    (value: string) => {
      if (value === 'whisper') {
        setView('whisper-models');
      } else {
        setSetting(
          SettingScope.User,
          'experimental.voice.backend',
          'gemini-live',
        );
        onClose();
      }
    },
    [setSetting, onClose],
  );

  const handleBackendHighlight = useCallback((value: string) => {
    setHighlightedBackend(value);
  }, []);

  const handleWhisperModelSelect = useCallback(
    async (modelName: string) => {
      if (modelManager.isModelInstalled(modelName)) {
        setSetting(SettingScope.User, 'experimental.voice.backend', 'whisper');
        setSetting(
          SettingScope.User,
          'experimental.voice.whisperModel',
          modelName,
        );
        onClose();
      } else {
        setError(null);
        const onProgress = (p: WhisperModelProgress) => setDownloadProgress(p);
        modelManager.on('progress', onProgress);

        try {
          await modelManager.downloadModel(modelName);

          setSetting(
            SettingScope.User,
            'experimental.voice.backend',
            'whisper',
          );
          setSetting(
            SettingScope.User,
            'experimental.voice.whisperModel',
            modelName,
          );
          onClose();
        } catch (err) {
          setError(
            `Failed to download: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          modelManager.off('progress', onProgress);
          setDownloadProgress(null);
        }
      }
    },
    [modelManager, setSetting, onClose],
  );

  const backendOptions = useMemo(
    () => [
      {
        value: 'gemini-live',
        title: 'Gemini Live API (Cloud)',
        description: 'Real-time cloud transcription via Gemini Live API.',
        key: 'gemini-live',
      },
      {
        value: 'whisper',
        title: 'Whisper (Local)',
        description: whisperInstalled
          ? 'Local transcription using whisper.cpp.'
          : 'Local transcription (Requires: brew install whisper-cpp)',
        key: 'whisper',
      },
    ],
    [whisperInstalled],
  );

  const whisperOptions = useMemo(
    () =>
      WHISPER_MODELS.map((m) => ({
        value: m.value,
        title: `${m.label}${modelManager.isModelInstalled(m.value) ? ' (Installed)' : ' (Download)'}`,
        description: m.description,
        key: m.value,
      })),
    [modelManager],
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
        {view === 'backend'
          ? 'Select Voice Transcription Backend'
          : 'Select Whisper Model'}
      </Text>

      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}

      {downloadProgress ? (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text>Downloading {downloadProgress.modelName}... </Text>
            <CliSpinner />
            <Text> {Math.round(downloadProgress.percentage * 100)}%</Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {view === 'backend' ? (
            <>
              <DescriptiveRadioButtonSelect
                items={backendOptions}
                onSelect={handleBackendSelect}
                onHighlight={handleBackendHighlight}
                initialIndex={currentBackend === 'whisper' ? 1 : 0}
                showNumbers={true}
              />
              {highlightedBackend === 'gemini-live' && (
                <Box marginTop={1}>
                  <WarningMessage text="When using the Gemini Live backend, voice recordings are sent to Google Cloud for transcription. Enterprise users should verify this aligns with their data privacy and compliance requirements." />
                </Box>
              )}
            </>
          ) : (
            <DescriptiveRadioButtonSelect
              items={whisperOptions}
              onSelect={handleWhisperModelSelect}
              initialIndex={whisperOptions.findIndex(
                (o) => o.value === currentWhisperModel,
              )}
              showNumbers={true}
            />
          )}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          {view === 'whisper-models'
            ? '(Press Esc to go back)'
            : '(Press Esc to close)'}
        </Text>
      </Box>
    </Box>
  );
}
