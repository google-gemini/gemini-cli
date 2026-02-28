/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

export const VoiceHelp: React.FC = () => (
  <Box
    flexDirection="column"
    marginBottom={1}
    borderColor={theme.border.default}
    borderStyle="round"
    padding={1}
  >
    <Text bold color={theme.text.primary}>
      Voice Input:
    </Text>

    <Box height={1} />

    <Text bold color={theme.text.primary}>
      Commands:
    </Text>
    {[
      ['/voice', 'Show current voice settings'],
      ['/voice enable', 'Enable voice input'],
      ['/voice disable', 'Disable voice input'],
      ['/voice provider [gemini|whisper]', 'Set transcription backend'],
      ['/voice sensitivity <0-1000>', 'Set silence detection threshold'],
      ['/voice set-path <path>', 'Set path to Whisper binary'],
      ['/voice help', 'Show this help'],
    ].map(([cmd, desc]) => (
      <Text key={cmd} color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          {' '}
          {cmd}
        </Text>
        {' - ' + desc}
      </Text>
    ))}

    <Box height={1} />

    <Text bold color={theme.text.primary}>
      Recording Shortcuts:
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Alt+R
      </Text>
      {' or '}
      <Text bold color={theme.text.accent}>
        Ctrl+Q
      </Text>
      {' - Start / stop recording'}
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        Esc
      </Text>
      {' - Cancel recording (discards audio, no transcription)'}
    </Text>

    <Box height={1} />

    <Text bold color={theme.text.primary}>
      Silence Sensitivity Guide:
    </Text>
    {[
      ['0', 'Disable silence detection (captures all audio)'],
      ['1–80', 'Sensitive — whispered speech (default: 80)'],
      ['80–300', 'Moderate — quiet speech'],
      ['300+', 'High — only louder speech'],
    ].map(([val, desc]) => (
      <Text key={val} color={theme.text.primary}>
        <Text bold color={theme.text.accent}>
          {' '}
          {val}
        </Text>
        {'  ' + desc}
      </Text>
    ))}

    <Box height={1} />

    <Text bold color={theme.text.primary}>
      Transcription Backends:
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        {' '}
        gemini
      </Text>
      {'  Zero-install. Uses your existing Gemini API auth. (default)'}
    </Text>
    <Text color={theme.text.primary}>
      <Text bold color={theme.text.accent}>
        {' '}
        whisper
      </Text>
      {'  Local Whisper binary (faster-whisper or openai-whisper).'}
    </Text>
  </Box>
);
