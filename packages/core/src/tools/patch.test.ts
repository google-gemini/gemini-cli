/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PatchTool, type PatchToolParams } from './patch.js';
import type { Config } from '../config/config.js';
import { type GeminiClient } from '../core/client.js';
import { fixFailedHunk } from '../utils/patch-fixer.js';
import {
  StandardFileSystemService,
  type FileSystemService,
} from '../services/fileSystemService.js';
import { ToolErrorType } from './tool-error.js';

describe('PatchTool Direct Invocation Test', () => {
  vi.mock('../utils/patch-fixer.js');

  let tempDir: string;
  let fsService: FileSystemService;
  let mockConfig: Config;
  let patchTool: PatchTool;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'patch-test-'));
    fsService = new StandardFileSystemService();

    mockConfig = {
      getFileSystemService: () => fsService,
      getTargetDir: () => tempDir,
      isPathWithinWorkspace: (p: string) => {
        const relative = path.relative(tempDir, p);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      },
      getGeminiClient: () => ({}) as unknown as GeminiClient,
    } as unknown as Config;
    patchTool = new PatchTool(mockConfig);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createTempFile(
    content: string,
    filename = 'test.txt',
  ): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('should apply a simple patch to a file', async () => {
    const initialContent = 'Hello, world!\n';
    const filePath = 'test.txt';
    await createTempFile(initialContent, filePath);

    const patch = `--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-Hello, world!
+Hello, universe!
`;
    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain('✅ ALL HUNKS APPLIED SUCCESSFULLY');
    const finalContent = await fs.readFile(
      path.join(tempDir, filePath),
      'utf-8',
    );
    expect(finalContent).toBe('Hello, universe!\n');
  });

  it('should create a new file', async () => {
    const filePath = 'new-file.txt';
    const patch = `--- /dev/null
+++ b/new-file.txt
@@ -0,0 +1,3 @@
+This is a new file.
+It has multiple lines.
+The end.
`.trim();
    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain(
      '✅ ALL HUNKS APPLIED SUCCESSFULLY for new-file.txt',
    );
    const finalContent = await fs.readFile(
      path.join(tempDir, filePath),
      'utf-8',
    );
    expect(finalContent).toContain('This is a new file.');
  });

  it('should delete a file', async () => {
    const filePath = 'to-delete.txt';
    await createTempFile('This file will be deleted.', filePath);
    const patch = `--- a/to-delete.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-This file will be deleted.
`.trim();
    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain('Deleted file');
    await expect(fs.access(path.join(tempDir, filePath))).rejects.toThrow();
  });

  it('should handle a multi-file patch successfully', async () => {
    await createTempFile("console.log('one');", 'file1.js');
    await createTempFile("console.log('two');", 'file2.js');

    const patch = `--- a/file1.js
+++ b/file1.js
@@ -1 +1 @@
-console.log('one');
+console.log('ONE');
--- a/file2.js
+++ b/file2.js
@@ -1 +1 @@
-console.log('two');
+console.log('TWO');
`.trim();
    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain(
      '📊 PATCH SUMMARY: 2/2 files patched successfully.',
    );
    const finalContent1 = await fs.readFile(
      path.join(tempDir, 'file1.js'),
      'utf-8',
    );
    expect(finalContent1).toBe("console.log('ONE');");
    const finalContent2 = await fs.readFile(
      path.join(tempDir, 'file2.js'),
      'utf-8',
    );
    expect(finalContent2).toBe("console.log('TWO');");
  });

  it('should report partial success when one file fails to patch', async () => {
    await createTempFile('This part is correct.', 'good.txt');
    await createTempFile('This content is wrong.', 'bad.txt');

    const patch = `--- a/good.txt
+++ b/good.txt
@@ -1 +1 @@
-This part is correct.
+This part is now updated.
--- a/bad.txt
+++ b/bad.txt
@@ -1 +1 @@
-This context does not exist.
+This will fail.
`.trim();

    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain(
      '✅ ALL HUNKS APPLIED SUCCESSFULLY for good.txt',
    );

    // Verify file states
    const finalContentGood = await fs.readFile(
      path.join(tempDir, 'good.txt'),
      'utf-8',
    );
    expect(finalContentGood).toBe('This part is now updated.');
    const finalContentBad = await fs.readFile(
      path.join(tempDir, 'bad.txt'),
      'utf-8',
    );
    expect(finalContentBad).toBe('This content is wrong.');
  });

  it('should return an error when all hunks for all files fail', async () => {
    const initialContent = 'original content';
    await createTempFile(initialContent, 'file.txt');

    const patch = `--- a/file.txt
+++ b/file.txt
@@ -1,1 +1,1 @@
-completely wrong content
+new content
`.trim();
    const params: PatchToolParams = { unified_diff: patch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(result.error?.type).toEqual(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND);
    expect(result.returnDisplay).toContain(
      'Error: No changes could be applied from the patch',
    );

    // Ensure the file was not modified
    const finalContent = await fs.readFile(
      path.join(tempDir, 'file.txt'),
      'utf-8',
    );
    expect(finalContent).toBe(initialContent);
  });

  it('should successfully heal a failed hunk', async () => {
    const initialContent = 'const foo = 1;\nconst bar = 2;\n';
    await createTempFile(initialContent, 'file.js');

    const failingPatch = `--- a/file.js
+++ b/file.js
@@ -1,2 +1,2 @@
THIS IS WRONG CONTEXT
-const bar = 2;
+const bar = 3;
`;

    const correctedPatch = `--- a/file.js
+ b/file.js
@@ -1,2 +1,2 @@
const foo = 1;
-const bar = 2;
+const bar = 3;
`;

    vi.mocked(fixFailedHunk).mockResolvedValue(correctedPatch);

    const params: PatchToolParams = { unified_diff: failingPatch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(fixFailedHunk).toHaveBeenCalledOnce();
    expect(result.returnDisplay).toContain(
      '✅ ALL HUNKS APPLIED SUCCESSFULLY for file.js',
    );

    const finalContent = await fs.readFile(
      path.join(tempDir, 'file.js'),
      'utf-8',
    );
    expect(finalContent).toBe('const foo = 1;\nconst bar = 3;\n');
  });

  it('should report a failure if healing also fails', async () => {
    const initialContent = 'const foo = 1;\nconst bar = 2;\n';
    await createTempFile(initialContent, 'file.js');

    const failingPatch = `--- a/file.js
+++ b/file.js
@@ -1,2 +1,2 @@
THIS IS WRONG CONTEXT
-const bar = 2;
+const bar = 3;
`;

    // Simulate the fixer returning another invalid patch
    vi.mocked(fixFailedHunk).mockResolvedValue(
      '--- a/file.js\n+++ b/file.js\n@@ -99,1 +99,1 @@\n-invalid\n+truly-invalid',
    );

    const params: PatchToolParams = { unified_diff: failingPatch };
    const invocation = patchTool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(fixFailedHunk).toHaveBeenCalledOnce();
    expect(result.returnDisplay).toContain(
      'Error: No changes could be applied from the patch.',
    );

    const finalContent = await fs.readFile(
      path.join(tempDir, 'file.js'),
      'utf-8',
    );
    expect(finalContent).toBe(initialContent);
  });
});
