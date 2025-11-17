/**
 * Copyright 2025 Google LLC
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextDetector } from './context-detector.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContextDetector', () => {
  let tempDir: string;
  let detector: ContextDetector;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
    detector = new ContextDetector(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect project type from package.json', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    const type = detector.detectProjectType();
    expect(type).toBe('nodejs');
  });

  it('should track recent files', () => {
    detector.trackFile('test.ts');
    detector.trackFile('app.ts');
    const context = detector.detect();
    expect((await context).recentFiles).toContain('app.ts');
  });

  it('should track recent commands', () => {
    detector.trackCommand('/wizard start');
    const context = detector.detect();
    expect((await context).recentCommands).toContain('/wizard start');
  });
});
