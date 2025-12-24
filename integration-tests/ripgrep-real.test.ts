/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { RipGrepTool } from '../packages/core/src/tools/ripGrep.js';
import { Config } from '../packages/core/src/config/config.js';
import { WorkspaceContext } from '../packages/core/src/utils/workspaceContext.js';

// Mock Config to provide necessary context
class MockConfig {
  constructor(private targetDir: string) {}

  getTargetDir() {
    return this.targetDir;
  }

  getWorkspaceContext() {
    return new WorkspaceContext(this.targetDir, [this.targetDir]);
  }

  getDebugMode() {
    return true;
  }

  getFileFilteringRespectGeminiIgnore() {
    return true;
  }
}

describe('ripgrep-real-direct', () => {
  let tempDir: string;
  let tool: RipGrepTool;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-real-test-'));

    // Create test files
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'hello world\n');
    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(
      path.join(tempDir, 'subdir', 'file2.txt'),
      'hello universe\n',
    );
    await fs.writeFile(path.join(tempDir, 'file3.txt'), 'goodbye moon\n');

    const config = new MockConfig(tempDir) as unknown as Config;
    tool = new RipGrepTool(config);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find matches using the real ripgrep binary', async () => {
    const invocation = tool.build({ pattern: 'hello' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 2 matches');
    expect(result.llmContent).toContain('file1.txt');
    expect(result.llmContent).toContain('L1: hello world');
    expect(result.llmContent).toContain('subdir'); // Should show path
    expect(result.llmContent).toContain('file2.txt');
    expect(result.llmContent).toContain('L1: hello universe');

    expect(result.llmContent).not.toContain('goodbye moon');
  });

  it('should handle no matches correctly', async () => {
    const invocation = tool.build({ pattern: 'nonexistent_pattern_123' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('No matches found');
  });

  it('should respect include filters', async () => {
    // Create a .js file
    await fs.writeFile(
      path.join(tempDir, 'script.js'),
      'console.log("hello");\n',
    );

    const invocation = tool.build({ pattern: 'hello', include: '*.js' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 1 match');
    expect(result.llmContent).toContain('script.js');
    expect(result.llmContent).not.toContain('file1.txt');
  });
});
