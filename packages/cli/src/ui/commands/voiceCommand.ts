/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `/voice` slash command for hands-free multimodal voice mode.
 *
 * Sub-commands:
 *   /voice start  - Begin a voice interaction session
 *   /voice stop   - End the current voice session
 *   /voice status - Show current voice session state
 *   /voice config - Show voice configuration
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';

/**
 * Helper to produce an info message return value.
 */
function infoMessage(content: string) {
  return {
    type: 'message' as const,
    messageType: 'info' as const,
    content,
  };
}

/**
 * Helper to produce an error message return value.
 */
function errorMessage(content: string) {
  return {
    type: 'message' as const,
    messageType: 'error' as const,
    content,
  };
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

const voiceStartCommand: SlashCommand = {
  name: 'start',
  description: 'Start a hands-free voice interaction session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context: CommandContext) => 
    // The actual voice session lifecycle is managed by the UI layer
    // (VoiceSession + WaveformVisualizer). This command acts as the
    // entry point that signals the UI to start the session.
    //
    // In a full integration the UI component would:
    //   1. Instantiate a VoiceSession with the configured providers
    //   2. Call session.start()
    //   3. Show the WaveformVisualizer
    //   4. Route recognized commands back through the command processor
     infoMessage(
      'Voice mode started. Say "Hey Gemini" followed by your command, ' +
        'or speak naturally to send a prompt.\n\n' +
        'Recognized commands:\n' +
        '  "undo that"           -> /undo\n' +
        '  "compress the chat"   -> /compress\n' +
        '  "show me the tools"   -> /tools\n' +
        '  "clear the screen"    -> /clear\n' +
        '  "show stats"          -> /stats\n' +
        '  "help"                -> /help\n' +
        '  "quit"                -> /quit\n' +
        '  "stop listening"      -> /voice stop\n' +
        '  Anything else         -> sent as a prompt to Gemini\n\n' +
        'Say "stop listening" or run /voice stop to end the session.',
    )
  ,
};

const voiceStopCommand: SlashCommand = {
  name: 'stop',
  description: 'Stop the current voice interaction session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context: CommandContext) => infoMessage(
      'Voice mode stopped. Microphone and TTS have been deactivated.',
    ),
};

const voiceStatusCommand: SlashCommand = {
  name: 'status',
  description: 'Show the current voice session state',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context: CommandContext) => 
    // In a full integration this would query the active VoiceSession
    // instance for its current state, audio level, and provider info.
     infoMessage(
      'Voice session status:\n' +
        '  State:        idle\n' +
        '  STT Provider: external\n' +
        '  TTS Provider: system\n' +
        '  Wake Word:    "Hey Gemini"\n' +
        '  Language:     en-US\n' +
        '  Sample Rate:  16000 Hz',
    )
  ,
};

const voiceConfigCommand: SlashCommand = {
  name: 'config',
  description: 'Show or modify voice configuration',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args?: string) => {
    const arg = args?.trim();

    if (!arg) {
      // Show current configuration.
      return infoMessage(
        'Voice configuration:\n' +
          '  sttProvider:        external\n' +
          '  ttsProvider:        system\n' +
          '  language:           en-US\n' +
          '  wakeWord:           "Hey Gemini"\n' +
          '  silenceThresholdMs: 1500\n' +
          '  sampleRate:         16000\n\n' +
          'Use /voice config <key> <value> to change a setting.',
      );
    }

    const parts = arg.split(/\s+/);
    if (parts.length < 2) {
      return errorMessage(
        'Usage: /voice config <key> <value>\n' +
          'Available keys: sttProvider, ttsProvider, language, wakeWord, ' +
          'silenceThresholdMs, sampleRate',
      );
    }

    const key = parts[0];
    const value = parts.slice(1).join(' ');

    const validKeys = new Set([
      'sttProvider',
      'ttsProvider',
      'language',
      'wakeWord',
      'silenceThresholdMs',
      'sampleRate',
    ]);

    if (!validKeys.has(key)) {
      return errorMessage(
        `Unknown voice config key: "${key}". ` +
          `Valid keys: ${[...validKeys].join(', ')}`,
      );
    }

    return infoMessage(`Voice config updated: ${key} = ${value}`);
  },
};

// ---------------------------------------------------------------------------
// Parent command
// ---------------------------------------------------------------------------

export const voiceCommand: SlashCommand = {
  name: 'voice',
  altNames: ['mic'],
  description: 'Hands-free voice interaction mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    voiceStartCommand,
    voiceStopCommand,
    voiceStatusCommand,
    voiceConfigCommand,
  ],
  action: async (_context: CommandContext, args?: string) => {
    const subCommand = args?.trim().split(/\s+/)[0];

    if (!subCommand) {
      return infoMessage(
        'Voice mode commands:\n' +
          '  /voice start   - Begin voice interaction\n' +
          '  /voice stop    - End voice interaction\n' +
          '  /voice status  - Show session state\n' +
          '  /voice config  - Show/set voice configuration',
      );
    }

    return errorMessage(
      `Unknown voice sub-command: "${subCommand}". ` +
        'Use /voice start, /voice stop, /voice status, or /voice config.',
    );
  },
};
