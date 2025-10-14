/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig, validateModelOutput } from './test-helper.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('@file processor with gitignored files', () => {
  it('should read gitignored files when explicitly referenced with @{file}', async () => {
    const rig = new TestRig();
    await rig.setup('should read gitignored files when explicitly referenced');

    // Create a test file with recognizable content
    const testContent = 'SECRET_CONTENT_FROM_GITIGNORED_FILE_12345';
    const testFileName = 'test-gitignored-file.txt';
    rig.createFile(testFileName, testContent);

    // Add the file to .gitignore
    const gitignorePath = join(rig.testDir!, '.gitignore');
    writeFileSync(gitignorePath, testFileName + '\n');

    // Verify the file is actually gitignored by checking .gitignore exists
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain(testFileName);

    // Sync filesystem
    rig.sync();

    // Execute command with @{file} syntax to explicitly reference the gitignored file
    const prompt = `Read the content of @{${testFileName}} and tell me what you see.`;
    const result = await rig.run(prompt);

    // Validate that:
    // 1. The model received and responded with the file content
    // 2. No "ignored" warning was shown
    expect(
      result,
      'Expected file content to be included in model response',
    ).toContain('SECRET_CONTENT_FROM_GITIGNORED_FILE');

    // Negative assertion: Ensure no "ignored" message appears
    expect(
      result.toLowerCase(),
      'Expected no gitignore/geminiignore warning message',
    ).not.toContain('ignored');

    // Validate model output (will throw if no output)
    validateModelOutput(result, null, '@file gitignored test');
  });

  it('should read geminiignored files when explicitly referenced with @{file}', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should read geminiignored files when explicitly referenced',
    );

    // Create a test file with recognizable content
    const testContent = 'GEMINI_IGNORED_CONTENT_67890';
    const testFileName = 'test-geminiignored-file.txt';
    rig.createFile(testFileName, testContent);

    // Add the file to .geminiignore
    const geminiignorePath = join(rig.testDir!, '.geminiignore');
    writeFileSync(geminiignorePath, testFileName + '\n');

    // Verify the file is actually geminiignored
    const geminiignoreContent = readFileSync(geminiignorePath, 'utf-8');
    expect(geminiignoreContent).toContain(testFileName);

    // Sync filesystem
    rig.sync();

    // Execute command with @{file} syntax
    const prompt = `Read the content of @{${testFileName}} and tell me exactly what text you see.`;
    const result = await rig.run(prompt);

    // Validate that the model received and responded with the file content
    expect(
      result,
      'Expected file content to be included in model response',
    ).toContain('GEMINI_IGNORED_CONTENT');

    // Negative assertion: Ensure no "ignored" message appears
    expect(
      result.toLowerCase(),
      'Expected no gitignore/geminiignore warning message',
    ).not.toContain('ignored');

    // Validate model output
    validateModelOutput(result, null, '@file geminiignored test');
  });
});
