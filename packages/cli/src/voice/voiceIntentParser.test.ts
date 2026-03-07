/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseVoiceIntent, suggestVoiceIntent } from './voiceIntentParser.js';

describe('voiceIntentParser', () => {
  it('maps "install dependencies" to npm install', () => {
    expect(parseVoiceIntent('install dependencies')).toBe('npm install');
  });

  it('maps "build project" to npm run build', () => {
    expect(parseVoiceIntent('build project')).toBe('npm run build');
  });

  it('suggests npm install for "install dep"', () => {
    expect(parseVoiceIntent('install dep')).toBeNull();
    expect(suggestVoiceIntent('install dep')).toBe('npm install');
  });

  it('returns null for unknown command suggestion', () => {
    expect(suggestVoiceIntent('tell me a joke')).toBeNull();
  });
});
