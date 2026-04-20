/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseVoiceCommand,
  getRecognizedPhrases,
} from '../voiceCommandParser.js';

describe('parseVoiceCommand', () => {
  describe('slash command mappings', () => {
    it('should map "undo that" to /undo', () => {
      const result = parseVoiceCommand('undo that');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/undo');
      expect(result.originalTranscript).toBe('undo that');
    });

    it('should map "undo" to /undo', () => {
      const result = parseVoiceCommand('undo');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/undo');
    });

    it('should map "compress the chat" to /compress', () => {
      const result = parseVoiceCommand('compress the chat');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/compress');
    });

    it('should map "summarize" to /compress', () => {
      const result = parseVoiceCommand('summarize');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/compress');
    });

    it('should map "show me the tools" to /tools', () => {
      const result = parseVoiceCommand('show me the tools');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/tools');
    });

    it('should map "clear the screen" to /clear', () => {
      const result = parseVoiceCommand('clear the screen');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/clear');
    });

    it('should map "show stats" to /stats', () => {
      const result = parseVoiceCommand('show stats');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/stats');
    });

    it('should map "help" to /help', () => {
      const result = parseVoiceCommand('help');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/help');
    });

    it('should map "quit" to /quit', () => {
      const result = parseVoiceCommand('quit');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/quit');
    });

    it('should map "stop listening" to /voice stop', () => {
      const result = parseVoiceCommand('stop listening');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/voice stop');
    });
  });

  describe('polite variants', () => {
    it('should handle "help please" as /help', () => {
      const result = parseVoiceCommand('help please');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/help');
    });

    it('should handle "clear please" as /clear', () => {
      const result = parseVoiceCommand('clear please');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/clear');
    });
  });

  describe('case insensitivity', () => {
    it('should match regardless of case', () => {
      const result = parseVoiceCommand('SHOW ME THE TOOLS');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/tools');
    });

    it('should match mixed case', () => {
      const result = parseVoiceCommand('Undo That');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/undo');
    });
  });

  describe('pattern-based commands', () => {
    it('should parse "change model to gemini-2.0" as /model set', () => {
      const result = parseVoiceCommand('change model to gemini-2.0');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/model set gemini-2.0');
    });

    it('should parse "switch the model to flash" as /model set', () => {
      const result = parseVoiceCommand('switch the model to flash');
      expect(result.type).toBe('slash');
      expect(result.value).toBe('/model set flash');
    });

    it('should parse "read file src/index.ts" as a prompt', () => {
      const result = parseVoiceCommand('read file src/index.ts');
      expect(result.type).toBe('prompt');
      expect(result.value).toBe('read the file src/index.ts');
    });

    it('should parse "search for TODO comments" as a prompt', () => {
      const result = parseVoiceCommand('search for TODO comments');
      expect(result.type).toBe('prompt');
      expect(result.value).toBe('search for TODO comments');
    });
  });

  describe('natural language prompts', () => {
    it('should treat unrecognized text as a prompt', () => {
      const result = parseVoiceCommand(
        'explain how the authentication system works',
      );
      expect(result.type).toBe('prompt');
      expect(result.value).toBe('explain how the authentication system works');
    });

    it('should handle empty input', () => {
      const result = parseVoiceCommand('');
      expect(result.type).toBe('prompt');
      expect(result.value).toBe('');
    });

    it('should handle whitespace-only input', () => {
      const result = parseVoiceCommand('   ');
      expect(result.type).toBe('prompt');
      expect(result.value).toBe('');
    });

    it('should preserve the original transcript', () => {
      const transcript = '  What is the weather today  ';
      const result = parseVoiceCommand(transcript);
      expect(result.originalTranscript).toBe(transcript);
      expect(result.value).toBe('What is the weather today');
    });
  });
});

describe('getRecognizedPhrases', () => {
  it('should return a non-empty list of phrase-to-command mappings', () => {
    const phrases = getRecognizedPhrases();
    expect(phrases.length).toBeGreaterThan(0);
  });

  it('should include undo mappings', () => {
    const phrases = getRecognizedPhrases();
    const undoPhrases = phrases.filter((p) => p.command === '/undo');
    expect(undoPhrases.length).toBeGreaterThan(0);
    expect(undoPhrases.some((p) => p.phrase === 'undo that')).toBe(true);
  });

  it('should have unique phrases', () => {
    const phrases = getRecognizedPhrases();
    const phraseTexts = phrases.map((p) => p.phrase);
    const uniquePhrases = new Set(phraseTexts);
    expect(uniquePhrases.size).toBe(phraseTexts.length);
  });
});
