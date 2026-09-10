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
    const result = await invocation.execute({ abortSignal });

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
    const result = await invocation.execute({ abortSignal });

    expect(result.error).toBeUndefined();
    expect(result.llmContent).toBe(expectedContent);
    expect(result.returnDisplay).toContain('index.md');
  });

  it('should prevent access to files outside the docs directory (Path Traversal)', async () => {
    // Attempt to read package.json from the root
    const invocation = tool.build({ path: '../package.json' });
    const result = await invocation.execute({ abortSignal });

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toContain('Access denied');
  });

  it('should prevent access to a sibling directory that shares the docs prefix', async () => {
    // getDocsRoot() resolves to the repository's real docs/ directory, so the
    // probe has to be a real sibling of it.
    const docsRoot = path.resolve(__dirname, '../../../../docs');
    const siblingDir = `${docsRoot}-traversal-probe`;
    const secret = 'SENSITIVE-PROBE-CONTENT';

    await fs.mkdir(siblingDir, { recursive: true });
    await fs.writeFile(path.join(siblingDir, 'secret.md'), secret, 'utf8');

    try {
      const invocation = tool.build({
        path: `../${path.basename(siblingDir)}/secret.md`,
      });
      const result = await invocation.execute({ abortSignal });

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.error?.message).toContain('Access denied');
      expect(String(result.llmContent)).not.toContain(secret);
    } finally {
      await fs.rm(siblingDir, { recursive: true, force: true });
    }
  });

  it('should prevent access through a symlink that points outside the docs directory', async () => {
    // The link itself sits inside docsRoot, so a lexical resolve still reports
    // an internal path. Only resolving the link exposes the real target.
    const docsRoot = path.resolve(__dirname, '../../../../docs');
    const outsideDir = `${docsRoot}-symlink-probe`;
    const secretFile = path.join(outsideDir, 'secret.md');
    const linkPath = path.join(docsRoot, 'symlink-escape-probe.md');
    const secret = 'SENSITIVE-SYMLINK-CONTENT';

    await fs.rm(linkPath, { force: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(secretFile, secret, 'utf8');
    await fs.symlink(secretFile, linkPath);

    try {
      const invocation = tool.build({ path: 'symlink-escape-probe.md' });
      const result = await invocation.execute({ abortSignal });

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.error?.message).toContain('Access denied');
      expect(String(result.llmContent)).not.toContain(secret);
    } finally {
      await fs.rm(linkPath, { force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('should prevent access through a symlinked directory that points outside the docs directory', async () => {
    // Same escape, but the link is an intermediate path segment rather than
    // the final one, so the whole chain has to be resolved.
    const docsRoot = path.resolve(__dirname, '../../../../docs');
    const outsideDir = `${docsRoot}-symlink-dir-probe`;
    const linkPath = path.join(docsRoot, 'symlink-dir-probe');
    const secret = 'SENSITIVE-SYMLINK-DIR-CONTENT';

    await fs.rm(linkPath, { force: true, recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'secret.md'), secret, 'utf8');
    await fs.symlink(
      outsideDir,
      linkPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    try {
      const invocation = tool.build({ path: 'symlink-dir-probe/secret.md' });
      const result = await invocation.execute({ abortSignal });

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.error?.message).toContain('Access denied');
      expect(String(result.llmContent)).not.toContain(secret);
    } finally {
      await fs.rm(linkPath, { force: true, recursive: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('should still allow a symlink that stays inside the docs directory', async () => {
    // Resolving symlinks must not turn every legitimate link into a denial.
    const docsRoot = path.resolve(__dirname, '../../../../docs');
    const targetPath = path.join(docsRoot, 'symlink-target-probe.md');
    const linkPath = path.join(docsRoot, 'symlink-internal-probe.md');
    const content = 'INTERNAL-SYMLINK-CONTENT';

    await fs.rm(linkPath, { force: true });
    await fs.writeFile(targetPath, content, 'utf8');
    await fs.symlink(targetPath, linkPath);

    try {
      const invocation = tool.build({ path: 'symlink-internal-probe.md' });
      const result = await invocation.execute({ abortSignal });

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toBe(content);
    } finally {
      await fs.rm(linkPath, { force: true });
      await fs.rm(targetPath, { force: true });
    }
  });

  it('should handle non-existent files', async () => {
    const invocation = tool.build({ path: 'this-file-does-not-exist.md' });
    const result = await invocation.execute({ abortSignal });

    expect(result.error).toBeDefined();
    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
  });
});
