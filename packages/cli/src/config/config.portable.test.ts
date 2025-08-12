/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { loadCliConfig, parseArguments } from './config.js';
import { Settings } from './settingsSchema.js';

vi.mock('fs', async () => {
  const actualFs = await vi.importActual<typeof fs>('fs');
  return {
    ...actualFs,
    existsSync: () => true,
    readFileSync: () => '',
  };
});
vi.mock('js-yaml');
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
  };
});

describe('loadCliConfig with portable config', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should load config from portable config file', async () => {
    const mockYaml = `
      settings:
        theme: "GitHub"
      env:
        MY_VAR: "my_value"
      context:
        geminiMd: "My custom context"
    `;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockYaml);
    vi.spyOn(yaml, 'load').mockReturnValue({
      settings: { theme: 'GitHub' },
      env: { MY_VAR: 'my_value' },
      context: { geminiMd: 'My custom context' },
    });

    process.argv = ['node', 'script.js', '--portable-config', 'config.yaml'];
    const argv = await parseArguments();
    const config = await loadCliConfig({}, [], 'test-session', argv);

    expect(config.getSettings().theme).toBe('GitHub');
    expect(process.env.MY_VAR).toBe('my_value');
    expect(config.getUserMemory()).toBe('My custom context');
  });

  it('should ignore settings.json when portable config is used', async () => {
    const mockYaml = `
      settings:
        theme: "Dracula"
    `;
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockYaml);
    vi.spyOn(yaml, 'load').mockReturnValue({
      settings: { theme: 'Dracula' },
    });

    process.argv = ['node', 'script.js', '--portable-config', 'config.yaml'];
    const argv = await parseArguments();
    // These settings should be ignored
    const settings: Settings = { theme: 'GitHub' };
    const config = await loadCliConfig(settings, [], 'test-session', argv);

    expect(config.getSettings().theme).toBe('Dracula');
  });
});
