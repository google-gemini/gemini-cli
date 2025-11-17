/**
 * Copyright 2025 Google LLC
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExplainMode } from './explain-mode.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ExplainMode', () => {
  let tempDir: string;
  let explainMode: ExplainMode;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'explain-test-'));
    const configPath = path.join(tempDir, 'explain-config.json');
    explainMode = new ExplainMode(configPath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should start disabled by default', () => {
    expect(explainMode.isEnabled()).toBe(false);
  });

  it('should enable and disable', () => {
    explainMode.enable();
    expect(explainMode.isEnabled()).toBe(true);
    explainMode.disable();
    expect(explainMode.isEnabled()).toBe(false);
  });

  it('should toggle mode', () => {
    const initial = explainMode.isEnabled();
    const toggled = explainMode.toggle();
    expect(toggled).toBe(!initial);
  });

  it('should set verbosity level', () => {
    explainMode.setVerbosity('detailed');
    expect(explainMode.getVerbosity()).toBe('detailed');
  });

  it('should explain tool usage', () => {
    const explanation = explainMode.explainTool('read-file', 'test.ts', 'To analyze the file');
    expect(explanation.toolName).toBe('read-file');
    expect(explanation.reason).toBe('To analyze the file');
  });

  it('should track tool usage statistics', () => {
    explainMode.explainTool('read-file');
    explainMode.explainTool('read-file');
    explainMode.explainTool('write-file');
    
    const stats = explainMode.getStats();
    expect(stats.byTool['read-file']).toBe(2);
    expect(stats.byTool['write-file']).toBe(1);
  });
});
