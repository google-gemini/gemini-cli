/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { PrivacyManager } from './privacyManager.js';
import { PrivacyMode } from './types.js';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('random-data')),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'hashed-value')
  }))
}));

const mockFs = fs as {
  writeFile: MockedFunction<typeof fs.writeFile>;
  readFile: MockedFunction<typeof fs.readFile>;
  access: MockedFunction<typeof fs.access>;
  mkdir: MockedFunction<typeof fs.mkdir>;
  unlink: MockedFunction<typeof fs.unlink>;
};

describe('PrivacyManager', () => {
  let privacyManager: PrivacyManager;
  const testConfigPath = '/test/privacy-config.json';

  beforeEach(() => {
    vi.clearAllMocks();
    privacyManager = new PrivacyManager(testConfigPath);
  });

  describe('initialization', () => {
    it('should initialize with default strict privacy mode', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await privacyManager.initialize();

      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.STRICT);
    });

    it('should load existing privacy configuration', async () => {
      const existingConfig = {
        mode: PrivacyMode.MODERATE,
        dataRetention: 30,
        allowTelemetry: false,
        encryptStorage: true,
        shareData: false,
        allowCloudSync: false
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      await privacyManager.initialize();

      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.MODERATE);
    });

    it('should create directory if it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await privacyManager.initialize();

      expect(mockFs.mkdir).toHaveBeenCalled();
    });
  });

  describe('privacy mode management', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should set privacy mode to strict', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);

      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.STRICT);

      const config = privacyManager.getPrivacySettings();
      expect(config.allowTelemetry).toBe(false);
      expect(config.shareData).toBe(false);
      expect(config.allowCloudSync).toBe(false);
      expect(config.encryptStorage).toBe(true);
    });

    it('should set privacy mode to moderate', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.MODERATE);

      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.MODERATE);

      const config = privacyManager.getPrivacySettings();
      expect(config.allowTelemetry).toBe(false);
      expect(config.shareData).toBe(false);
      expect(config.allowCloudSync).toBe(false);
      expect(config.encryptStorage).toBe(true);
    });

    it('should set privacy mode to open', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);

      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.OPEN);

      const config = privacyManager.getPrivacySettings();
      expect(config.allowTelemetry).toBe(true);
      expect(config.shareData).toBe(true);
      expect(config.allowCloudSync).toBe(true);
      expect(config.encryptStorage).toBe(false);
    });

    it('should save configuration when mode changes', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.MODERATE);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[mockFs.writeFile.mock.calls.length - 1];
      const savedConfig = JSON.parse(writeCall[1] as string);
      expect(savedConfig.mode).toBe(PrivacyMode.MODERATE);
    });
  });

  describe('data sanitization', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should sanitize sensitive data in strict mode', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);

      const sensitiveData = {
        userInput: 'My password is secret123',
        apiKey: 'sk-1234567890abcdef',
        email: 'user@example.com',
        prompt: 'Tell me about machine learning'
      };

      const sanitized = privacyManager.sanitizeData(sensitiveData);

      expect(sanitized.userInput).toContain('[REDACTED]');
      expect(sanitized.apiKey).toContain('[REDACTED]');
      expect(sanitized.email).toContain('[REDACTED]');
      expect(sanitized.prompt).toBe('Tell me about machine learning'); // Non-sensitive
    });

    it('should preserve data in open mode', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);

      const data = {
        userInput: 'My password is secret123',
        apiKey: 'sk-1234567890abcdef',
        email: 'user@example.com'
      };

      const sanitized = privacyManager.sanitizeData(data);

      expect(sanitized.userInput).toBe(data.userInput);
      expect(sanitized.apiKey).toBe(data.apiKey);
      expect(sanitized.email).toBe(data.email);
    });

    it('should partially sanitize in moderate mode', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.MODERATE);

      const data = {
        userInput: 'My password is secret123',
        apiKey: 'sk-1234567890abcdef',
        email: 'user@example.com',
        generalText: 'This is general content'
      };

      const sanitized = privacyManager.sanitizeData(data);

      expect(sanitized.userInput).toContain('[REDACTED]');
      expect(sanitized.apiKey).toContain('[REDACTED]');
      expect(sanitized.generalText).toBe('This is general content');
    });

    it('should handle nested objects', () => {
      const nestedData = {
        level1: {
          level2: {
            password: 'secret123',
            username: 'user',
            config: {
              apiKey: 'sk-abcdef'
            }
          }
        }
      };

      const sanitized = privacyManager.sanitizeData(nestedData);

      expect(sanitized.level1.level2.password).toContain('[REDACTED]');
      expect(sanitized.level1.level2.config.apiKey).toContain('[REDACTED]');
    });

    it('should handle arrays', () => {
      const arrayData = {
        messages: [
          { content: 'Hello world', sensitive: false },
          { content: 'My password is secret', sensitive: true },
          { content: 'API key: sk-12345', sensitive: true }
        ]
      };

      const sanitized = privacyManager.sanitizeData(arrayData);

      expect(sanitized.messages[0].content).toBe('Hello world');
      expect(sanitized.messages[1].content).toContain('[REDACTED]');
      expect(sanitized.messages[2].content).toContain('[REDACTED]');
    });
  });

  describe('consent management', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should check if telemetry is allowed', () => {
      expect(privacyManager.canCollectTelemetry()).toBe(false);
    });

    it('should check if data sharing is allowed', () => {
      expect(privacyManager.canShareData()).toBe(false);
    });

    it('should check if cloud sync is allowed', () => {
      expect(privacyManager.canSyncToCloud()).toBe(false);
    });

    it('should allow operations in open mode', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);

      expect(privacyManager.canCollectTelemetry()).toBe(true);
      expect(privacyManager.canShareData()).toBe(true);
      expect(privacyManager.canSyncToCloud()).toBe(true);
    });

    it('should restrict operations in strict mode', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);

      expect(privacyManager.canCollectTelemetry()).toBe(false);
      expect(privacyManager.canShareData()).toBe(false);
      expect(privacyManager.canSyncToCloud()).toBe(false);
    });
  });

  describe('data encryption', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should encrypt sensitive data when encryption is enabled', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);

      const sensitiveData = 'This is sensitive information';
      const encrypted = privacyManager.encryptData(sensitiveData);

      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should decrypt encrypted data', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);

      const originalData = 'This is sensitive information';
      const encrypted = privacyManager.encryptData(originalData);
      const decrypted = privacyManager.decryptData(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should return plain data when encryption is disabled', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);

      const data = 'This is some data';
      const result = privacyManager.encryptData(data);

      expect(result).toBe(data);
    });
  });

  describe('data retention', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should get data retention period', () => {
      const retention = privacyManager.getDataRetentionDays();
      expect(typeof retention).toBe('number');
      expect(retention).toBeGreaterThan(0);
    });

    it('should set data retention period', async () => {
      await privacyManager.setDataRetention(60);

      const retention = privacyManager.getDataRetentionDays();
      expect(retention).toBe(60);
    });

    it('should use different retention periods for different modes', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);
      const strictRetention = privacyManager.getDataRetentionDays();

      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);
      const openRetention = privacyManager.getDataRetentionDays();

      expect(strictRetention).toBeLessThanOrEqual(openRetention);
    });
  });

  describe('privacy audit', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should generate privacy audit report', () => {
      const report = privacyManager.generatePrivacyReport();

      expect(report).toBeDefined();
      expect(report.mode).toBeDefined();
      expect(report.settings).toBeDefined();
      expect(report.dataRetentionDays).toBeDefined();
      expect(typeof report.encryptionEnabled).toBe('boolean');
      expect(Array.isArray(report.dataTypes)).toBe(true);
    });

    it('should include security recommendations', () => {
      const report = privacyManager.generatePrivacyReport();

      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should show different recommendations for different modes', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.OPEN);
      const openReport = privacyManager.generatePrivacyReport();

      await privacyManager.setPrivacyMode(PrivacyMode.STRICT);
      const strictReport = privacyManager.generatePrivacyReport();

      expect(openReport.recommendations).not.toEqual(strictReport.recommendations);
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.access.mockRejectedValue(new Error('Permission denied'));
      mockFs.mkdir.mockRejectedValue(new Error('Cannot create directory'));

      await expect(privacyManager.initialize()).rejects.toThrow();
    });

    it('should handle invalid configuration data', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');

      await privacyManager.initialize();

      // Should fall back to default configuration
      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.STRICT);
    });

    it('should handle encryption errors', async () => {
      await privacyManager.initialize();

      // Test with invalid data types
      expect(() => privacyManager.encryptData(null as any)).not.toThrow();
      expect(() => privacyManager.encryptData(undefined as any)).not.toThrow();
    });
  });

  describe('configuration persistence', () => {
    beforeEach(async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      await privacyManager.initialize();
    });

    it('should persist custom privacy settings', async () => {
      await privacyManager.setPrivacyMode(PrivacyMode.MODERATE);
      await privacyManager.setDataRetention(45);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const lastCall = mockFs.writeFile.mock.calls[mockFs.writeFile.mock.calls.length - 1];
      const savedConfig = JSON.parse(lastCall[1] as string);

      expect(savedConfig.mode).toBe(PrivacyMode.MODERATE);
      expect(savedConfig.dataRetention).toBe(45);
    });

    it('should validate configuration on load', async () => {
      const invalidConfig = {
        mode: 'invalid-mode',
        dataRetention: -1,
        allowTelemetry: 'not-boolean'
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      await privacyManager.initialize();

      // Should use default values for invalid settings
      const mode = privacyManager.getCurrentMode();
      expect(mode).toBe(PrivacyMode.STRICT);

      const retention = privacyManager.getDataRetentionDays();
      expect(retention).toBeGreaterThan(0);
    });
  });
});