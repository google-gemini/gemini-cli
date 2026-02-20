/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import { skillDir } from './skills.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set this to true locally when you need to update snapshots
const RECORD_MODE = process.env['RECORD_NEW_RESPONSES'] === 'true';

const getGoldenPath = (name: string) =>
  path.resolve(__dirname, '../test-data', `${name}.json`);

const SKILL_DIR = path.resolve(__dirname, '../test-data/skills/pirate-skill');
const SKILL_ROOT = path.resolve(__dirname, '../test-data/skills');

describe('GeminiCliAgent Skills Integration', () => {
  it('loads and activates a skill from a directory', async () => {
    const goldenFile = getGoldenPath('skill-dir-success');

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      skills: [skillDir(SKILL_DIR)],
      // If recording, use real model + record path.
      // If testing, use auto model + fake path.
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    // 1. Ask to activate the skill
    const events = [];
    const session = agent.session();
    // The prompt explicitly asks to activate the skill by name
    const stream = session.sendStream(
      'Activate the pirate-skill and then tell me a joke.',
    );

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    // Expect pirate speak
    expect(responseText.toLowerCase()).toContain('arrr');
  }, 60000);

  it('loads and activates a skill from a root', async () => {
    const goldenFile = getGoldenPath('skill-root-success');

    const agent = new GeminiCliAgent({
      instructions: 'You are a helpful assistant.',
      skills: [skillDir(SKILL_ROOT)],
      // If recording, use real model + record path.
      // If testing, use auto model + fake path.
      model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
      recordResponses: RECORD_MODE ? goldenFile : undefined,
      fakeResponses: RECORD_MODE ? undefined : goldenFile,
    });

    // 1. Ask to activate the skill
    const events = [];
    const session = agent.session();
    const stream = session.sendStream(
      'Activate the pirate-skill and confirm it is active.',
    );

    for await (const event of stream) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'content');
    const responseText = textEvents
      .map((e) => (typeof e.value === 'string' ? e.value : ''))
      .join('');

    // Expect confirmation or pirate speak
    expect(responseText.toLowerCase()).toContain('arrr');
  }, 60000);
});
