/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import { AuthType } from '@google/gemini-cli-core';
import type { Settings } from '../config/settingsSchema.js';

describe('getUserStartupWarnings', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('googleCloudProjectCheck', () => {
    it('should warn when LOGIN_WITH_GOOGLE is used without GOOGLE_CLOUD_PROJECT', async () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const settings: Settings = {
        security: {
          auth: {
            selectedType: AuthType.LOGIN_WITH_GOOGLE,
          },
        },
      } as Settings;

      const warnings = await getUserStartupWarnings(settings);

      const projectWarning = warnings.find(
        (w) => w.id === 'google-cloud-project-missing',
      );
      expect(projectWarning).toBeDefined();
      expect(projectWarning?.message).toContain('GOOGLE_CLOUD_PROJECT');
      expect(projectWarning?.message).toContain('403 PERMISSION_DENIED');
    });

    it('should not warn when GOOGLE_CLOUD_PROJECT is set', async () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';

      const settings: Settings = {
        security: {
          auth: {
            selectedType: AuthType.LOGIN_WITH_GOOGLE,
          },
        },
      } as Settings;

      const warnings = await getUserStartupWarnings(settings);

      const projectWarning = warnings.find(
        (w) => w.id === 'google-cloud-project-missing',
      );
      expect(projectWarning).toBeUndefined();
    });

    it('should not warn when GOOGLE_CLOUD_PROJECT_ID is set', async () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project';

      const settings: Settings = {
        security: {
          auth: {
            selectedType: AuthType.LOGIN_WITH_GOOGLE,
          },
        },
      } as Settings;

      const warnings = await getUserStartupWarnings(settings);

      const projectWarning = warnings.find(
        (w) => w.id === 'google-cloud-project-missing',
      );
      expect(projectWarning).toBeUndefined();
    });

    it('should not warn when using different auth types', async () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      const authTypes = [
        AuthType.USE_GEMINI,
        AuthType.USE_VERTEX_AI,
        AuthType.COMPUTE_ADC,
      ];

      for (const authType of authTypes) {
        const settings: Settings = {
          security: {
            auth: {
              selectedType: authType,
            },
          },
        } as Settings;

        const warnings = await getUserStartupWarnings(settings);

        const projectWarning = warnings.find(
          (w) => w.id === 'google-cloud-project-missing',
        );
        expect(projectWarning).toBeUndefined();
      }
    });
  });
});
