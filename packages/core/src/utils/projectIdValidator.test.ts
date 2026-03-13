/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getConfiguredProjectId,
  hasConfiguredProjectId,
  getMissingProjectIdMessage,
  getInvalidProjectIdMessage,
  isValidProjectIdFormat,
} from './projectIdValidator.js';

describe('projectIdValidator', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isValidProjectIdFormat', () => {
    it('should return true for valid project IDs', () => {
      expect(isValidProjectIdFormat('my-project-123')).toBe(true);
      expect(isValidProjectIdFormat('test-project')).toBe(true);
      expect(isValidProjectIdFormat('a12345')).toBe(true);
      expect(isValidProjectIdFormat('project-with-many-hyphens-ok')).toBe(true);
    });

    it('should return false for invalid project IDs', () => {
      expect(isValidProjectIdFormat('123-project')).toBe(false); // starts with number
      expect(isValidProjectIdFormat('Project')).toBe(false); // uppercase
      expect(isValidProjectIdFormat('my-project-')).toBe(false); // ends with hyphen
      expect(isValidProjectIdFormat('short')).toBe(false); // too short (< 6 chars)
      expect(isValidProjectIdFormat('a'.repeat(31))).toBe(false); // too long (> 30 chars)
      expect(isValidProjectIdFormat('my_project')).toBe(false); // underscore not allowed
      expect(isValidProjectIdFormat('my project')).toBe(false); // space not allowed
      expect(isValidProjectIdFormat('')).toBe(false); // empty
    });

    it('should return false for non-string inputs', () => {
      expect(isValidProjectIdFormat(null as unknown as string)).toBe(false);
      expect(isValidProjectIdFormat(undefined as unknown as string)).toBe(
        false,
      );
      expect(isValidProjectIdFormat(123 as unknown as string)).toBe(false);
      expect(isValidProjectIdFormat({} as unknown as string)).toBe(false);
    });
  });

  describe('getConfiguredProjectId', () => {
    it('should return project ID from GOOGLE_CLOUD_PROJECT', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project-123';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBe('test-project-123');
    });

    it('should return project ID from GOOGLE_CLOUD_PROJECT_ID', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'test-project-456';

      expect(getConfiguredProjectId()).toBe('test-project-456');
    });

    it('should prefer GOOGLE_CLOUD_PROJECT over GOOGLE_CLOUD_PROJECT_ID', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'preferred-project';
      process.env['GOOGLE_CLOUD_PROJECT_ID'] = 'fallback-project';

      expect(getConfiguredProjectId()).toBe('preferred-project');
    });

    it('should return undefined when neither variable is set', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '   ';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBeUndefined();
    });

    it('should trim whitespace from project ID', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '  test-project  ';
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBe('test-project');
    });

    it('should handle non-string environment variable values', () => {
      // This tests defensive programming - environment variables should always be strings
      // but we want to handle edge cases gracefully
      process.env['GOOGLE_CLOUD_PROJECT'] = undefined as unknown as string;
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(getConfiguredProjectId()).toBeUndefined();
    });
  });

  describe('hasConfiguredProjectId', () => {
    it('should return true when project ID is configured', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';

      expect(hasConfiguredProjectId()).toBe(true);
    });

    it('should return false when project ID is not configured', () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];
      delete process.env['GOOGLE_CLOUD_PROJECT_ID'];

      expect(hasConfiguredProjectId()).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '';

      expect(hasConfiguredProjectId()).toBe(false);
    });

    it('should return false for whitespace-only string', () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = '   ';

      expect(hasConfiguredProjectId()).toBe(false);
    });
  });

  describe('getMissingProjectIdMessage', () => {
    it('should return standard message without context', () => {
      const message = getMissingProjectIdMessage();

      expect(message).toContain(
        'GOOGLE_CLOUD_PROJECT environment variable is not set',
      );
      expect(message).toContain('export GOOGLE_CLOUD_PROJECT');
      expect(message).toContain('https://console.cloud.google.com/');
      expect(message).toContain(
        'https://goo.gle/gemini-cli-auth-docs#workspace-gca',
      );
    });

    it('should include context when provided', () => {
      const context = 'Authentication requires a project ID.';
      const message = getMissingProjectIdMessage(context);

      expect(message).toContain(context);
      expect(message).toContain(
        'GOOGLE_CLOUD_PROJECT environment variable is not set',
      );
    });
  });

  describe('getInvalidProjectIdMessage', () => {
    it('should return message with sanitized project ID', () => {
      const projectId = 'invalid-project-123';
      const message = getInvalidProjectIdMessage(projectId);

      expect(message).toContain(`Invalid Google Cloud project: "${projectId}"`);
      expect(message).toContain('does not exist or you do not have access');
      expect(message).toContain('https://console.cloud.google.com/');
      expect(message).toContain(
        'https://goo.gle/gemini-cli-auth-docs#workspace-gca',
      );
    });

    it('should sanitize special characters in project ID', () => {
      const projectId = 'project<script>alert("xss")</script>';
      const message = getInvalidProjectIdMessage(projectId);

      // Should not contain the script tags
      expect(message).not.toContain('<script>');
      expect(message).not.toContain('</script>');
      // Should contain sanitized version
      expect(message).toContain('projectscriptalertxssscript');
    });

    it('should handle very long project IDs', () => {
      const projectId = 'a'.repeat(200);
      const message = getInvalidProjectIdMessage(projectId);

      // Should be truncated to 100 characters
      expect(message).toContain('a'.repeat(100));
      expect(message).not.toContain('a'.repeat(101));
    });

    it('should handle non-string inputs gracefully', () => {
      const message = getInvalidProjectIdMessage(null as unknown as string);
      expect(message).toContain('Invalid Google Cloud project');
    });
  });
});
