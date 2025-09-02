/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { vi } from 'vitest';
import { saveGeminiApiKeyToEnvFile, validateAuthMethod } from './auth.js';
import fs from 'node:fs';
import * as settings from './settings.js';

vi.mock('node:fs');

describe('auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(settings, 'loadSettings').mockReturnValue(
      new settings.LoadedSettings(
        { settings: {}, path: '' },
        { settings: {}, path: '' },
        { settings: {}, path: '' },
        { settings: {}, path: '' },
        [],
        true,
        new Set(),
      ),
    );
    vi.spyOn(settings, 'loadEnvironment').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateAuthMethod', () => {
    it('should return null for LOGIN_WITH_GOOGLE', () => {
      expect(validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE)).toBeNull();
    });

    it('should return null for CLOUD_SHELL', () => {
      expect(validateAuthMethod(AuthType.CLOUD_SHELL)).toBeNull();
    });

    describe('USE_GEMINI', () => {
      it('should return null if GEMINI_API_KEY is set', () => {
        vi.stubEnv('GEMINI_API_KEY', 'test-key');
        expect(validateAuthMethod(AuthType.USE_GEMINI)).toBeNull();
      });

      it('should return an error message if GEMINI_API_KEY is not set', () => {
        vi.stubEnv('GEMINI_API_KEY', undefined);
        expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
          'GEMINI_API_KEY environment variable not found. Please provide one to continue.',
        );
      });
    });

    describe('USE_VERTEX_AI', () => {
      it('should return null if GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set', () => {
        vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'test-project');
        vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'test-location');
        expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
      });

      it('should return null if GOOGLE_API_KEY is set', () => {
        vi.stubEnv('GOOGLE_API_KEY', 'test-api-key');
        expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
      });

      it('should return an error message if no required environment variables are set', () => {
        vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
        vi.stubEnv('GOOGLE_CLOUD_LOCATION', undefined);
        expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBe(
          'When using Vertex AI, you must specify either:\n' +
            '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
            '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
            'Update your environment and try again (no reload needed if using .env)!',
        );
      });
    });

    it('should return an error message for an invalid auth method', () => {
      expect(validateAuthMethod('invalid-method')).toBe(
        'Invalid auth method selected.',
      );
    });
  });

  describe('saveGeminiApiKeyToEnvFile', () => {
    it('should save the key to a new .env file', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const writeSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {});
      const result = saveGeminiApiKeyToEnvFile('test-key');
      expect(result).toBe(true);
      expect(writeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'GEMINI_API_KEY="test-key"\n',
        'utf-8',
      );
    });

    it('should add the key to an existing .env file', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('EXISTING_VAR=true');
      const writeSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {});
      const result = saveGeminiApiKeyToEnvFile('test-key');
      expect(result).toBe(true);
      expect(writeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'EXISTING_VAR=true\nGEMINI_API_KEY="test-key"\n',
        'utf-8',
      );
    });

    it('should update an existing key in the .env file', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('GEMINI_API_KEY="old-key"');
      const writeSpy = vi
        .spyOn(fs, 'writeFileSync')
        .mockImplementation(() => {});
      const result = saveGeminiApiKeyToEnvFile('new-key');
      expect(result).toBe(true);
      expect(writeSpy).toHaveBeenCalledWith(
        expect.any(String),
        'GEMINI_API_KEY="new-key"',
        'utf-8',
      );
    });

    it('should return false on error', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('FS Error');
      });
      const result = saveGeminiApiKeyToEnvFile('test-key');
      expect(result).toBe(false);
    });
  });
});