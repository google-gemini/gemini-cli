/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Maps spoken transcripts to CLI actions.
 *
 * Recognizes common voice command phrases and converts them to
 * slash commands. Anything that does not match a known command
 * pattern is treated as a natural language prompt to send to Gemini.
 */

import type { VoiceCommand } from './types.js';

/**
 * A single mapping from a set of spoken phrases to a slash command.
 */
interface CommandMapping {
  /** Phrases that trigger this command (matched case-insensitively). */
  phrases: string[];
  /** The slash command to produce (e.g. "/compress"). */
  command: string;
}

/**
 * A mapping that extracts an argument from the spoken phrase.
 * The pattern should contain a named capture group `(?<arg>...)`.
 */
interface PatternMapping {
  /** Regex pattern with a named `arg` capture group. */
  pattern: RegExp;
  /** A function that produces the command string from the captured argument. */
  toCommand: (arg: string) => string;
}

// ---------------------------------------------------------------------------
// Static command mappings
// ---------------------------------------------------------------------------

const COMMAND_MAPPINGS: readonly CommandMapping[] = [
  {
    phrases: ['undo that', 'undo last', 'undo'],
    command: '/undo',
  },
  {
    phrases: ['compress the chat', 'compress chat', 'compress', 'summarize'],
    command: '/compress',
  },
  {
    phrases: [
      'show me the tools',
      'show tools',
      'list tools',
      'what tools are available',
    ],
    command: '/tools',
  },
  {
    phrases: ['clear the screen', 'clear screen', 'clear'],
    command: '/clear',
  },
  {
    phrases: ['show stats', 'show statistics', 'stats'],
    command: '/stats',
  },
  {
    phrases: ['show help', 'help me', 'help'],
    command: '/help',
  },
  {
    phrases: ['show memory', 'memory', 'what do you remember'],
    command: '/memory',
  },
  {
    phrases: ['quit', 'exit', 'goodbye', 'bye'],
    command: '/quit',
  },
  {
    phrases: ['stop listening', 'stop voice', 'voice off'],
    command: '/voice stop',
  },
];

// ---------------------------------------------------------------------------
// Pattern-based command mappings (with arguments)
// ---------------------------------------------------------------------------

const PATTERN_MAPPINGS: readonly PatternMapping[] = [
  {
    // "read file src/index.ts" -> natural prompt "read file src/index.ts"
    // We keep file-related commands as prompts so Gemini can use its tools.
    pattern: /^read\s+(?:the\s+)?file\s+(?<arg>.+)$/i,
    toCommand: (arg: string) => `read the file ${arg}`,
  },
  {
    // "search for <query>" -> natural prompt for Gemini to use grep
    pattern: /^search\s+(?:for\s+)?(?<arg>.+)$/i,
    toCommand: (arg: string) => `search for ${arg}`,
  },
  {
    // "change model to <model>" -> /model set <model>
    pattern:
      /^(?:change|switch|set)\s+(?:the\s+)?model\s+(?:to\s+)?(?<arg>.+)$/i,
    toCommand: (arg: string) => `/model set ${arg}`,
  },
  {
    // "change theme to <theme>" -> /theme set <theme>
    pattern:
      /^(?:change|switch|set)\s+(?:the\s+)?theme\s+(?:to\s+)?(?<arg>.+)$/i,
    toCommand: (arg: string) => `/theme ${arg}`,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a voice transcript into a structured {@link VoiceCommand}.
 *
 * The function first checks against known command phrases and patterns.
 * If no match is found, the transcript is treated as a natural language
 * prompt to be sent to Gemini.
 *
 * @param transcript - The spoken text from the STT engine.
 * @returns A {@link VoiceCommand} representing the parsed intent.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const normalizedText = transcript.trim();

  if (!normalizedText) {
    return {
      type: 'prompt',
      value: '',
      originalTranscript: transcript,
    };
  }

  const lowerText = normalizedText.toLowerCase();

  // Check static phrase mappings first.
  for (const mapping of COMMAND_MAPPINGS) {
    for (const phrase of mapping.phrases) {
      if (lowerText === phrase || lowerText === phrase + ' please') {
        return {
          type: 'slash',
          value: mapping.command,
          originalTranscript: transcript,
        };
      }
    }
  }

  // Check pattern-based mappings.
  for (const mapping of PATTERN_MAPPINGS) {
    const match = normalizedText.match(mapping.pattern);
    if (match?.groups?.['arg']) {
      const value = mapping.toCommand(match.groups['arg']);
      // Determine if the result is a slash command or a prompt.
      const isSlash = value.startsWith('/');
      return {
        type: isSlash ? 'slash' : 'prompt',
        value,
        originalTranscript: transcript,
      };
    }
  }

  // No known command matched -- treat as a natural language prompt.
  return {
    type: 'prompt',
    value: normalizedText,
    originalTranscript: transcript,
  };
}

/**
 * Returns a list of all recognized voice command phrases for
 * display in help text.
 */
export function getRecognizedPhrases(): ReadonlyArray<{
  phrase: string;
  command: string;
}> {
  return COMMAND_MAPPINGS.flatMap((mapping) =>
    mapping.phrases.map((phrase) => ({
      phrase,
      command: mapping.command,
    })),
  );
}
