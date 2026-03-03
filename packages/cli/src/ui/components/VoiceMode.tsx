/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { VoiceSessionState } from '@google/gemini-cli-core';

interface VoiceModeProps {
  onClose: () => void;
}

/**
 * State indicator labels and colors for each voice session state.
 */
const STATE_DISPLAY: Record<
  VoiceSessionState,
  { label: string; color: string }
> = {
  [VoiceSessionState.IDLE]: { label: 'IDLE', color: theme.text.secondary },
  [VoiceSessionState.CONNECTING]: {
    label: 'CONNECTING...',
    color: theme.status.warning,
  },
  [VoiceSessionState.CONNECTED]: {
    label: 'CONNECTED',
    color: theme.status.success,
  },
  [VoiceSessionState.LISTENING]: {
    label: 'LISTENING',
    color: theme.text.accent,
  },
  [VoiceSessionState.RESPONDING]: {
    label: 'RESPONDING',
    color: theme.text.link,
  },
  [VoiceSessionState.DISCONNECTING]: {
    label: 'DISCONNECTING...',
    color: theme.status.warning,
  },
  [VoiceSessionState.ERROR]: { label: 'ERROR', color: theme.status.error },
};

/**
 * Simple ASCII waveform visualization for voice activity.
 * Returns a string like: |..||.|||...|
 */
function renderWaveform(isActive: boolean, width = 20): string {
  if (!isActive) {
    return '.'.repeat(width);
  }
  // Generate a simple animated waveform pattern
  const chars = ['.', '|', ':', '!', '|', '.'];
  return Array.from(
    { length: width },
    () => chars[Math.floor(Math.random() * chars.length)] ?? '.',
  ).join('');
}

/**
 * VoiceMode component for the Ink TUI.
 *
 * This is a proof-of-concept UI overlay that would display when the user
 * activates voice mode via `/voice`. In a full implementation, this would:
 * - Show real-time session state (connecting, listening, responding)
 * - Display an ASCII waveform visualization of audio activity
 * - Show transcriptions of both user and model speech
 * - Provide keyboard controls for mute, interrupt, and disconnect
 *
 * For the PoC, it demonstrates the dialog component pattern and state display.
 */
export const VoiceMode: React.FC<VoiceModeProps> = ({ onClose }) => {
  const [sessionState] = useState<VoiceSessionState>(VoiceSessionState.IDLE);
  const [transcriptions] = useState<
    Array<{ role: 'user' | 'model'; text: string }>
  >([]);

  // In the full implementation, a callback like the following would be used
  // to push real-time transcriptions from the VoiceService event callbacks:
  //   const addTranscription = (role, text) =>
  //     setTranscriptions(prev => [...prev.slice(-9), { role, text }]);

  // Handle keyboard input
  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const stateDisplay = STATE_DISPLAY[sessionState];
  const isActive =
    sessionState === VoiceSessionState.LISTENING ||
    sessionState === VoiceSessionState.RESPONDING;
  const waveform = renderWaveform(isActive);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      marginY={1}
      width="100%"
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={theme.text.accent}>
          Voice Mode
        </Text>
        <Text color={stateDisplay.color}>{stateDisplay.label}</Text>
      </Box>

      {/* Waveform visualization */}
      <Box marginY={1} justifyContent="center">
        <Text color={isActive ? theme.text.accent : theme.text.secondary}>
          [{waveform}]
        </Text>
      </Box>

      {/* Transcription display */}
      <Box flexDirection="column" marginY={1}>
        {transcriptions.length === 0 ? (
          <Text color={theme.text.secondary} italic>
            No transcriptions yet. Voice mode is not yet connected.
          </Text>
        ) : (
          transcriptions.map((t, i) => (
            <Box key={`transcription-${i}`}>
              <Text
                color={
                  t.role === 'user' ? theme.text.accent : theme.status.success
                }
                bold
              >
                {t.role === 'user' ? 'You: ' : 'Gemini: '}
              </Text>
              <Text>{t.text}</Text>
            </Box>
          ))
        )}
      </Box>

      {/* Status bar */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderColor={theme.border.default}
      >
        <Text color={theme.text.secondary}>
          Press <Text bold>ESC</Text> to exit voice mode
          {'  '}|{'  '}
          <Text bold>m</Text> to toggle mute
          {'  '}|{'  '}
          <Text bold>Space</Text> to interrupt
        </Text>
      </Box>

      {/* PoC notice */}
      <Box marginTop={1}>
        <Text color={theme.status.warning} italic>
          This is a proof-of-concept. Audio I/O requires platform-specific
          bindings (e.g., naudiodon/PortAudio) which are not yet integrated. The
          VoiceService backend is fully functional for WebSocket streaming.
        </Text>
      </Box>
    </Box>
  );
};

// Re-export for use by addTranscription in a real integration
VoiceMode.displayName = 'VoiceMode';
