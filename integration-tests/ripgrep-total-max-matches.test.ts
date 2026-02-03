/**
 * @license
 * Copyright 2026 Google LLC
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

describe('ripgrep-total-max-matches', () => {
  let tempDir: string;
  let tool: RipGrepTool;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ripgrep-total-max-test-'),
    );

    // Create a test file with multiple matches
    const content = `
      match 1
      match 2
      match 3
      match 4
      match 5
    `;
    await fs.writeFile(path.join(tempDir, 'many_matches.txt'), content);

    const config = new MockConfig(tempDir) as unknown as Config;
    tool = new RipGrepTool(config);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should limit total matches when total_max_matches is set', async () => {
    const invocation = tool.build({
      pattern: 'match',
      total_max_matches: 3,
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 3 matches');
    expect(result.llmContent).toContain('match 1');
    expect(result.llmContent).toContain('match 2');
    expect(result.llmContent).toContain('match 3');
    expect(result.llmContent).not.toContain('match 4');
    expect(result.llmContent).not.toContain('match 5');
    expect(result.llmContent).toContain(
      '(results limited to 3 matches for performance)',
    );
  });

  it('should use default limit when total_max_matches is not set', async () => {
    // We can't easily test the default 100 without 100 matches, but we can verify it doesn't fail.
    const invocation = tool.build({ pattern: 'match' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Found 5 matches');
  });
});
