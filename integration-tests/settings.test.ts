/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import fs from 'node:fs';
import { loadSettings } from '../packages/cli/src/config/settings.js';

describe('settings', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rig.cleanup();
  });

  describe('environment variables', () => {
    it('should resolve environment variables loaded from workspace .env file', () => {
      rig.setup('settings-env-resolution');

      const workspaceDir = rig.testDir!;
      const geminiDir = join(workspaceDir, '.gemini');
      fs.mkdirSync(geminiDir, { recursive: true });

      fs.writeFileSync(
        join(workspaceDir, '.env'),
        'MY_INTEGRATION_TEST_SECRET=integration-resolved-success\n',
      );

      fs.writeFileSync(
        join(geminiDir, 'settings.json'),
        JSON.stringify({
          mcpServers: {
            testServer: {
              command: 'echo',
              args: ['$MY_INTEGRATION_TEST_SECRET'],
            },
          },
        }),
      );

      vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', 'true');

      const settings = loadSettings(workspaceDir);

      expect(settings.merged.mcpServers?.['testServer']?.args).toEqual([
        'integration-resolved-success',
      ]);
    });
  });
});
