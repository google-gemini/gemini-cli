/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { Config, type ConfigParameters } from './config.js';

describe('Config Path Validation Integration', () => {
  let config: Config;
  const projectRoot = process.cwd();

  beforeEach(() => {
    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: projectRoot,
      debugMode: false,
      model: 'test-model',
      cwd: projectRoot,
    };
    config = new Config(params);
  });

  it('should reject pathologically long paths in validatePathAccess', () => {
    const longPath = path.join(projectRoot, 'a'.repeat(5000));
    const result = config.validatePathAccess(longPath, 'read');
    expect(result).toContain('Invalid path: Path is too long');
  });

  it('should reject paths with log markers in validatePathAccess', () => {
    const logPath = path.join(
      projectRoot,
      'AssertionError: expected true to be false',
    );
    const result = config.validatePathAccess(logPath, 'read');
    expect(result).toContain(
      'Invalid path: Path appears to be a misinterpreted log fragment',
    );
  });

  it('should reject paths with control characters in validatePathAccess', () => {
    const malformedPath = path.join(projectRoot, 'file\nwith\nnewline.txt');
    const result = config.validatePathAccess(malformedPath, 'read');
    expect(result).toContain('Invalid path: Path contains invalid characters');
  });

  it('should allow normal paths in validatePathAccess', () => {
    const normalPath = path.resolve(projectRoot, 'src/index.ts');
    const result = config.validatePathAccess(normalPath, 'read');

    // It might return "outside workspace" if not fully initialized,
    // but it should NOT return the "Invalid path" prefix from PathValidator.
    if (result) {
      expect(result).not.toContain('Invalid path:');
    } else {
      expect(result).toBeNull();
    }
  });
});
