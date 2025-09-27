/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Comprehensive test suite for the diff_patch tool.
 * This suite validates all behaviors, including fuzzy matching, error handling,
 * file creation, and multi-file patches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse, applyPatchesToFS } from './patcher.js';
import type { PatcherConfig } from './patcher.js';

describe('TestPatchBehaviors', () => {
  let tempDir: string;
  let mockConfig: PatcherConfig;

  // Setup: Create a temporary directory before each test
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'patch-test-'));
    mockConfig = {
      getTargetDir: () => tempDir,
      isPathWithinWorkspace: (p: string) => {
        const relative = path.relative(tempDir, p);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      },
    };
  });

  // Teardown: Clean up the temporary directory after each test
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a file within the temporary test directory.
   * @param content The content of the file.
   * @param filename The name of the file.
   * @return The full path to the created file.
   */
  async function createTempFile(
    content: string,
    filename = 'test.ts',
  ): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Applies standard unified diff format patches. It ignores line numbers and uses
   * content-based matching for high accuracy.
   *
   * This is the main entry point for the patcher library.
   */
  async function diffPatch(patchesStr: string): Promise<string> {
    const fileHunks = parse(patchesStr);
    const ret = await applyPatchesToFS(fileHunks, mockConfig);
    return ret;
  }

  it('should completely ignore line numbers', async () => {
    const content = `function function_a(): string {
    return "a";
}

function function_b(): string {
    return "b";
}

function function_c(): string {
    return "c";
}`;
    await createTempFile(content, 'test.ts');

    // Patch with completely wrong line numbers (999,999) but GOOD CONTEXT
    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -999,3 +999,3 @@
 function function_b(): string {
-    return "b";
+    return "modified_b";
 }`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('return "modified_b";');
    expect(modified).not.toContain('return "b"');
  });

  it('should process hunks as atomic units', async () => {
    const content = `class MyClass {
    constructor() {
        this.value = 0;
        this.name = "test";
    }

    process() {
        return this.value;
    }
}`;
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -2,5 +2,6 @@
     constructor() {
-        this.value = 0;
-        this.name = "test";
+        this.value = 42;
+        this.name = "modified";
+        this.description = "new field";
     }

     process() {
         return this.value;
`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('this.value = 42;');
    expect(modified).toContain('this.name = "modified";');
    expect(modified).toContain('this.description = "new field"');
  });

  it('should create a new file', async () => {
    const newFileName = 'new_module.ts';
    const diffStr = `--- /dev/null
+++ b/${newFileName}
@@ -0,0 +1,5 @@
+/** A new module. */
+export class NewClass {
+  public static run(): string {
+    return 'new';
+  }
+}`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const newFilePath = path.join(tempDir, newFileName);
    const content = await fs.readFile(newFilePath, 'utf-8');
    expect(content).toContain('export class NewClass');
  });

  it('should delete a file', async () => {
    const content = 'This file should be deleted.';
    const filePath = await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ /dev/null
@@ -1 +0,0 @@
-This file should be deleted.
`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');
    expect(result).toContain('Deleted file');

    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('should handle multiple files being processed', async () => {
    await createTempFile('content for file1', 'file1.ts');
    await createTempFile('content for file2', 'file2.ts');

    const diffStr = `--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,1 @@
-content for file1
+modified content for file1
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,1 @@
-content for file2
+modified content for file2`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('2/2 files patched successfully');
    expect(result).toContain('SUCCESSFULLY for file1.ts');
    expect(result).toContain('SUCCESSFULLY for file2.ts');

    const content1 = await fs.readFile(path.join(tempDir, 'file1.ts'), 'utf-8');
    expect(content1).toBe('modified content for file1');
    const content2 = await fs.readFile(path.join(tempDir, 'file2.ts'), 'utf-8');
    expect(content2).toBe('modified content for file2');
  });

  it('should handle graceful failure for unmatchable patches', async () => {
    const content = `function existing_function() {
    return "exists";
}`;
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 class CompletelyDifferentClass {
-    constructor() {
+    constructor(value: any) {
         this.data = "something";
 }`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('FAILED');
    expect(result).toContain('Could not locate context');

    const contentAfter = await fs.readFile(
      path.join(tempDir, 'test.ts'),
      'utf-8',
    );
    expect(contentAfter).toBe(content); // File should be unchanged
  });

  it('should preserve file structure on partial error', async () => {
    const content = `function important_function() {
    // This function must not be corrupted
    return "critical_data";
}

function another_function() {
    return "other_data";
}`;
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,5 @@
 function important_function() {
     // This function must not be corrupted
+    // Added a comment
     return "critical_data";
---
-a/test.ts
+++ b/test.ts
@@ -999,3 +999,3 @@
 def nonexistent_function():
-    return "this does not exist"
+    return "this also does not exist"`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('PARTIAL SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('// Added a comment');
    expect(modified).toContain('return "critical_data"');
  });

  it('should reject a patch trying to access outside the working directory', async () => {
    const diffStr = `--- a/../test.ts
+++ b/../test.ts
@@ -1,1 +1,1 @@
-foo
+bar
`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('FAILED: ../test.ts');
    expect(result).toContain('Security violation');
  });

  it('should show failed hunks for manual application', async () => {
    await createTempFile('line one\nline two\nline three\n');
    const badHunk = `@@ -1,3 +1,3 @@
 line one
-something that does not exist
+something new
 line three`;
    const diffStr = `--- a/test.ts\n+++ b/test.ts\n${badHunk}`;

    const result = await diffPatch(diffStr);

    expect(result).toContain('FAILED HUNKS FOR MANUAL APPLICATION');
    expect(result).toContain(badHunk);
  });

  it('should skip a hunk if it appears to be already applied', async () => {
    const content = 'const x = 2;';
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;`;

    const result = await diffPatch(diffStr);
    // The tool should see 'const x = 2' is already present and skip.
    expect(result).toContain('SUCCESS');
    expect(result).not.toContain('FAILED');

    const finalContent = await fs.readFile(
      path.join(tempDir, 'test.ts'),
      'utf-8',
    );
    expect(finalContent).toBe(content);
  });

  it('should apply multiple hunks in reverse order', async () => {
    const content = `// Hunk 2 Target
function second() {
    return 'second';
}

// Hunk 1 Target
function first() {
    return 'first';
}`;
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -6,3 +6,4 @@
 // Hunk 1 Target
 function first() {
-    return 'first';
+    return 'first modified';
+    // Comment added
}
@@ -1,4 +1,4 @@
 // Hunk 2 Target
 function second() {
-    return 'second';
+    return 'second modified';
 }
`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('first modified');
    expect(modified).toContain('second modified');
  });

  it('should handle pure insertions with context', async () => {
    const content = `class DatabaseManager {
    constructor() {}

    disconnect() {}
}`;
    await createTempFile(content);

    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -2,3 +2,7 @@
     constructor() {}

+    connect() {
+        // new connection logic
+    }
+
     disconnect() {}
 }`;

    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('connect()');
  });

  it('should tolerate whitespace and formatting variations', async () => {
    const content = `function process(data: any) {
    if   (data   ===   null) {
        return false;
    }
    return true;
}`;
    await createTempFile(content);

    // This patch has normalized whitespace compared to the original content
    const diffStr = `--- a/test.ts
+++ b/test.ts
@@ -1,5 +1,6 @@
 function process(data: any) {
-    if   (data   ===   null) {
+    if (data === null) {
+        console.log('Data was null');
         return false;
     }
     return true;
`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain("console.log('Data was null')");
  });

  it('should be compatible with git format-patch output', async () => {
    const content = `def hello():
    return "world"
`;
    await createTempFile(content);

    const diffStr = `From 1234567890abcdef1234567890abcdef12345678 Mon Sep 17 00:00:00 2001
From: A. Developer <dev@example.com>
Date: Tue, 2 Sep 2025 16:00:00 -0700
Subject: [PATCH] Update hello function

---
 test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

diff --git a/test.ts b/test.ts
index abc123..def456 100644
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,2 @@
 def hello():
-    return "world"
+    return "universe"
`;
    const result = await diffPatch(diffStr);
    expect(result).toContain('SUCCESS');

    const modified = await fs.readFile(path.join(tempDir, 'test.ts'), 'utf-8');
    expect(modified).toContain('return "universe"');
  });

  it('should handle empty and no-op patches gracefully', async () => {
    const content = 'hello world';
    await createTempFile(content);

    // Test 1: Empty diff string
    const resultEmpty = await diffPatch('');
    expect(resultEmpty).toContain('No valid patches found');

    // Test 2: Diff with only context lines (no changes)
    const noChangeDiff = `--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,1 @@
 hello world`;
    const resultNoChange = await diffPatch(noChangeDiff);
    // This should fail gracefully because the change results in no modification
    expect(resultNoChange).toContain('SUCCESS');
    expect(resultNoChange).toContain('Skipped as no-op');
  });
});
