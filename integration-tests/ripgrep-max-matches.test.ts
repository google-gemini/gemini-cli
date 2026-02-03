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

  getFileFilteringOptions() {
    return {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
      customIgnoreFilePaths: [],
    };
  }

  validatePathAccess() {
    return null;
  }
}

describe('ripgrep-max-matches', () => {
  let tempDir: string;
  let tool: RipGrepTool;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-max-test-'));

    // Create a test file with multiple matches
    const content = `
      match 1
      filler
      match 2
      filler
      match 3
      filler
      match 4
    `;
    await fs.writeFile(path.join(tempDir, 'many_matches.txt'), content);

    const config = new MockConfig(tempDir) as unknown as Config;
    tool = new RipGrepTool(config);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should limit matches per file when max_matches_per_file is set', async () => {
    const invocation = tool.build({
      pattern: 'match',
      max_matches_per_file: 2,
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 2 matches');
    expect(result.llmContent).toContain('many_matches.txt');
    expect(result.llmContent).toContain('match 1');
    expect(result.llmContent).toContain('match 2');
    expect(result.llmContent).not.toContain('match 3');
    expect(result.llmContent).not.toContain('match 4');
  });

  it('should return all matches when max_matches_per_file is not set', async () => {
    const invocation = tool.build({ pattern: 'match' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 4 matches');
    expect(result.llmContent).toContain('match 1');
    expect(result.llmContent).toContain('match 2');
    expect(result.llmContent).toContain('match 3');
    expect(result.llmContent).toContain('match 4');
  });
});
