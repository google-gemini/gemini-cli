/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { getBootstrapSettingsPath } from './bootstrapSettings.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('resolves settings under the default home .gemini directory', () => {
  vi.stubEnv('GEMINI_CLI_HOME', '');

  expect(getBootstrapSettingsPath()).toBe(
    path.join(os.homedir(), '.gemini', 'settings.json'),
  );
});

it('treats GEMINI_CLI_HOME as the replacement home directory', () => {
  const customHome = path.join(os.tmpdir(), 'gemini-custom-home');
  vi.stubEnv('GEMINI_CLI_HOME', customHome);

  expect(getBootstrapSettingsPath()).toBe(
    path.join(customHome, '.gemini', 'settings.json'),
  );
});
