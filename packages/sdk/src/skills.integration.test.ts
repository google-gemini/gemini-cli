/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import { skillDir } from './skills.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  collectResponseText,
  collectSessionEvents,
  createManagedSession,
} from '../test-utils/sessionHarness.js';
import { expectTestOutput } from '../test-utils/outputControl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const session = createManagedSession(agent);
    // The prompt explicitly asks to activate the skill by name
    const events = await collectSessionEvents(
      session,
      'Activate the pirate-skill and then tell me a joke.',
    );
    const responseText = collectResponseText(events);

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
    const session = createManagedSession(agent);
    const events = await collectSessionEvents(
      session,
      'Activate the pirate-skill and confirm it is active.',
    );
    const responseText = collectResponseText(events);

    // Expect confirmation or pirate speak
    expect(responseText.toLowerCase()).toContain('arrr');
  }, 60000);

  it('logs a controlled debug message for a non-skill directory', async () => {
    const goldenFile = getGoldenPath('agent-static-instructions');
    const invalidSkillDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-sdk-invalid-skill-'),
    );
    await fs.writeFile(path.join(invalidSkillDir, 'README.md'), 'not a skill');

    expectTestOutput({
      source: 'debugLogger',
      level: 'debug',
      pattern:
        /Failed to load skills from .*The directory is not empty but no valid skills were discovered\./,
    });

    try {
      const agent = new GeminiCliAgent({
        instructions: 'You are a pirate. Respond in pirate speak.',
        skills: [skillDir(invalidSkillDir)],
        model: RECORD_MODE ? 'gemini-2.0-flash' : undefined,
        recordResponses: RECORD_MODE ? goldenFile : undefined,
        fakeResponses: RECORD_MODE ? undefined : goldenFile,
      });

      const session = createManagedSession(agent);
      const events = await collectSessionEvents(session, 'Say hello.');

      expect(collectResponseText(events)).toContain('Ahoy');
    } finally {
      await fs.rm(invalidSkillDir, { recursive: true, force: true });
    }
  }, 30000);
});
