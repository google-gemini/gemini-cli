/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GetInternalDocsTool } from './get-internal-docs.js';
import { ToolErrorType } from './tool-error.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('GetInternalDocsTool (Integration)', () => {
  let tool: GetInternalDocsTool;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    tool = new GetInternalDocsTool(createMockMessageBus());
  });

  it('should find the documentation root and list files', async () => {
    const invocation = tool.build({});
    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeUndefined();
    // Verify we found some files
    expect(result.returnDisplay).toMatch(/Found \d+ documentation files/);

    // Check for a known file that should exist in the docs
    // We assume 'index.md' or 'sidebar.json' exists in docs/
    const content = result.llmContent as string;
    expect(content).toContain('index.md');
  });

  it('should read a specific documentation file', async () => {
    // Read the actual index.md from the real file system to compare
    // We need to resolve the path relative to THIS test file to find the expected content
    // Test file is in packages/core/src/tools/
    // Docs are in docs/ (root)
    const expectedDocsPath = path.resolve(
      __dirname,
      '../../../../docs/index.md',
    );
    const expectedContent = await fs.readFile(expectedDocsPath, 'utf8');

    const invocation = tool.build({ path: 'index.md' });
    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeUndefined();
    expect(result.llmContent).toBe(expectedContent);
    expect(result.returnDisplay).toContain('index.md');
  });

  it('should prevent access to files outside the docs directory (Path Traversal)', async () => {
    // Attempt to read package.json from the root
    const invocation = tool.build({ path: '../package.json' });
    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toContain('Access denied');
  });

  it('should handle non-existent files', async () => {
    const invocation = tool.build({ path: 'this-file-does-not-exist.md' });
    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
  });
});
