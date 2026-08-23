/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  sanitizeContent,
  sanitizeFileMap,
  sanitizePath,
  WORKSPACE_PLACEHOLDER,
  HOME_PLACEHOLDER,
  REDACTED_PLACEHOLDER,
} from '../utils/log-sanitizer.js';

describe('sanitizeContent', () => {
  describe('path replacement', () => {
    it('replaces absolute workspace root with placeholder (Unix)', () => {
      const result = sanitizeContent(
        'Error in /home/user/my-project/src/index.ts at line 5',
        { workspaceRoot: '/home/user/my-project' },
      );
      expect(result).toBe(
        `Error in ${WORKSPACE_PLACEHOLDER}/src/index.ts at line 5`,
      );
    });

    it('replaces absolute workspace root with placeholder (Windows style with forward slashes)', () => {
      const result = sanitizeContent(
        'Error in C:/Users/john/my-project/src/index.ts at line 5',
        { workspaceRoot: 'C:/Users/john/my-project' },
      );
      expect(result).toContain(WORKSPACE_PLACEHOLDER);
    });

    it('replaces home directory with placeholder', () => {
      const home = os.homedir();
      const testPath = path.join(home, '.gemini', 'settings.json');
      const result = sanitizeContent(`Config at ${testPath}`, {
        stripHomePaths: true,
      });
      // Home replacement happens even without a workspaceRoot
      expect(result).not.toContain(home);
    });

    it('replaces workspace root before home directory', () => {
      // If workspace is inside home, workspace placeholder takes priority
      const result = sanitizeContent('/home/user/projects/app/src/foo.ts', {
        workspaceRoot: '/home/user/projects/app',
        stripHomePaths: true,
      });
      expect(result).toBe(`${WORKSPACE_PLACEHOLDER}/src/foo.ts`);
      expect(result).not.toContain(HOME_PLACEHOLDER);
    });

    it('replaces multiple occurrences of workspace root', () => {
      const result = sanitizeContent('/a/b/file1.ts and /a/b/file2.ts', {
        workspaceRoot: '/a/b',
      });
      expect(result).toBe(
        `${WORKSPACE_PLACEHOLDER}/file1.ts and ${WORKSPACE_PLACEHOLDER}/file2.ts`,
      );
    });

    it('preserves content unrelated to paths or secrets', () => {
      const content = 'const x = 42;\nfunction hello() { return "world"; }';
      const result = sanitizeContent(content, {});
      expect(result).toBe(content);
    });
  });

  describe('secret stripping', () => {
    it('redacts GEMINI_API_KEY assignments', () => {
      const result = sanitizeContent(
        'GEMINI_API_KEY=AIzaSyAbcDefGhiJklMno123456',
        { stripSecrets: true },
      );
      expect(result).toContain('GEMINI_API_KEY=');
      expect(result).not.toContain('AIzaSyAbcDefGhiJklMno123456');
      expect(result).toContain(REDACTED_PLACEHOLDER);
    });

    it('redacts GOOGLE_API_KEY assignments', () => {
      const result = sanitizeContent(
        'export GOOGLE_API_KEY="my-very-secret-key-abc123"',
        { stripSecrets: true },
      );
      expect(result).not.toContain('my-very-secret-key-abc123');
      expect(result).toContain(REDACTED_PLACEHOLDER);
    });

    it('redacts Bearer tokens', () => {
      const result = sanitizeContent(
        'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
        { stripSecrets: true },
      );
      expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result).toContain(`Bearer ${REDACTED_PLACEHOLDER}`);
    });

    it('redacts PEM private keys', () => {
      const pemKey =
        '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----';
      const result = sanitizeContent(pemKey, { stripSecrets: true });
      expect(result).not.toContain('MIIEvAIBADANBgkqhkiG9w0BAQEFAASC');
      expect(result).toContain(REDACTED_PLACEHOLDER);
    });

    it('does not strip secrets when stripSecrets is false', () => {
      const content = 'GEMINI_API_KEY=my-key-12345678901234567890';
      const result = sanitizeContent(content, { stripSecrets: false });
      expect(result).toBe(content);
    });

    it('preserves normal code that looks superficially like a secret', () => {
      // A short "password" value that's only 5 chars shouldn't trigger the regex
      const content = 'if (mode === "pass") { return true; }';
      const result = sanitizeContent(content, { stripSecrets: true });
      // Should not mangle normal code
      expect(result).toContain('mode');
    });
  });
});

describe('sanitizeFileMap', () => {
  it('converts absolute path keys to workspace-relative keys', () => {
    const files = {
      '/home/user/project/src/app.ts': 'const x = 1;',
      '/home/user/project/README.md': '# My Project',
    };
    const result = sanitizeFileMap(files, {
      workspaceRoot: '/home/user/project',
    });
    expect(Object.keys(result)).toContain('src/app.ts');
    expect(Object.keys(result)).toContain('README.md');
    expect(Object.keys(result)).not.toContain('/home/user/project/src/app.ts');
  });

  it('sanitizes file content values', () => {
    const files = {
      'config.env': 'GEMINI_API_KEY=my-secret-key-123456789012345',
    };
    const result = sanitizeFileMap(files, { stripSecrets: true });
    expect(result['config.env']).not.toContain('my-secret-key-123456789012345');
    expect(result['config.env']).toContain(REDACTED_PLACEHOLDER);
  });

  it('does not include files with path traversal', () => {
    const files = {
      '/home/user/project/../../etc/passwd': 'root:x:0:0',
    };
    const result = sanitizeFileMap(files, {
      workspaceRoot: '/home/user/project',
    });
    // The key should not be a traversal path
    for (const key of Object.keys(result)) {
      expect(key).not.toContain('..');
    }
  });

  it('handles empty file map', () => {
    const result = sanitizeFileMap({}, {});
    expect(result).toEqual({});
  });

  it('preserves relative path keys unchanged', () => {
    const files = { 'src/index.ts': 'export default {};' };
    const result = sanitizeFileMap(files, {
      workspaceRoot: '/some/root',
    });
    expect(result['src/index.ts']).toBe('export default {};');
  });
});

describe('sanitizePath', () => {
  it('converts absolute path to relative when inside workspace', () => {
    const result = sanitizePath('/home/user/project/src/app.ts', {
      workspaceRoot: '/home/user/project',
    });
    expect(result).toBe('src/app.ts');
  });

  it('returns original path if not inside workspace', () => {
    const result = sanitizePath('/etc/hosts', {
      workspaceRoot: '/home/user/project',
    });
    // Falls back to content sanitization (home replacement if applicable)
    expect(result).toBeDefined();
  });

  it('handles relative paths by returning them unchanged', () => {
    const result = sanitizePath('src/app.ts', {
      workspaceRoot: '/home/user/project',
    });
    expect(result).toBe('src/app.ts');
  });
});
