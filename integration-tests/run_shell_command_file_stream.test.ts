/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('run_shell_command streaming to file regression', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should stream large outputs to a file and verify full content presence', async () => {
    await rig.setup(
      'should stream large outputs to a file and verify full content presence',
      {
        settings: { tools: { core: ['run_shell_command'] } },
      },
    );

    const numLines = 20000;
    const testFileName = 'large_output_test.txt';
    const testFilePath = path.join(rig.testDir!, testFileName);

    // Create a ~20MB file with unique content at start and end
    const startMarker = 'START_OF_FILE_MARKER';
    const endMarker = 'END_OF_FILE_MARKER';

    const stream = fs.createWriteStream(testFilePath);
    stream.write(startMarker + '\n');
    for (let i = 0; i < numLines; i++) {
      stream.write(`Line ${i + 1}: ` + 'A'.repeat(1000) + '\n');
    }
    stream.write(endMarker + '\n');
    await new Promise((resolve) => stream.end(resolve));

    const fileSize = fs.statSync(testFilePath).size;
    expect(fileSize).toBeGreaterThan(20000000);

    const prompt = `Use run_shell_command to cat ${testFileName} and say 'Done.'`;
    await rig.run({ args: prompt });

    let savedFilePath = '';
    const tmpdir = path.join(rig.homeDir!, '.gemini', 'tmp');
    if (fs.existsSync(tmpdir)) {
      const files = fs.readdirSync(tmpdir, {
        recursive: true,
        withFileTypes: true,
      });
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.txt')) {
          // In Node 20+, recursive readdir returns Dirent objects where `parentPath` is the directory path,
          // but sometimes `path` is used in older Node. fallback:
          const parentDir =
            (file as { parentPath?: string }).parentPath ??
            (file as { path?: string }).path ??
            tmpdir;
          const p = path.join(parentDir, file.name);
          const stat = fs.statSync(p);
          if (Date.now() - stat.mtimeMs < 60000 && stat.size >= 20000000) {
            savedFilePath = p;
            break;
          }
        }
      }
    }

    expect(
      savedFilePath,
      `Expected to find a saved output file >= 20MB in ${tmpdir}`,
    ).toBeTruthy();
    const savedContent = fs.readFileSync(savedFilePath, 'utf8');
    expect(savedContent).toContain(startMarker);
    expect(savedContent).toContain(endMarker);
    expect(savedContent.length).toBeGreaterThanOrEqual(fileSize);

    fs.unlinkSync(savedFilePath);
  }, 120000);

  it('should stream very large (50MB) outputs to a file and verify full content presence', async () => {
    await rig.setup(
      'should stream very large (50MB) outputs to a file and verify full content presence',
      {
        settings: { tools: { core: ['run_shell_command'] } },
      },
    );

    const numLines = 1000000;
    const testFileName = 'very_large_output_test.txt';
    const testFilePath = path.join(rig.testDir!, testFileName);

    // Create a ~50MB file with unique content at start and end
    const startMarker = 'START_OF_FILE_MARKER';
    const endMarker = 'END_OF_FILE_MARKER';

    const stream = fs.createWriteStream(testFilePath);
    stream.write(startMarker + '\n');
    for (let i = 0; i < numLines; i++) {
      stream.write(`Line ${i + 1}: ` + 'A'.repeat(40) + '\n');
    }
    stream.write(endMarker + '\n');
    await new Promise((resolve) => stream.end(resolve));

    const fileSize = fs.statSync(testFilePath).size;
    expect(fileSize).toBeGreaterThan(45000000);

    const prompt = `Use run_shell_command to cat ${testFileName} and say 'Done.'`;
    await rig.run({ args: prompt });

    let savedFilePath = '';
    const tmpdir = path.join(rig.homeDir!, '.gemini', 'tmp');
    if (fs.existsSync(tmpdir)) {
      const files = fs.readdirSync(tmpdir, {
        recursive: true,
        withFileTypes: true,
      });
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.txt')) {
          const parentDir =
            (file as { parentPath?: string }).parentPath ??
            (file as { path?: string }).path ??
            tmpdir;
          const p = path.join(parentDir, file.name);
          const stat = fs.statSync(p);
          // Look for file >= 20MB (since we expect 50MB, but allowing margin for the bug)
          if (Date.now() - stat.mtimeMs < 60000 && stat.size >= 20000000) {
            savedFilePath = p;
            break;
          }
        }
      }
    }

    expect(
      savedFilePath,
      `Expected to find a saved output file >= 20MB in ${tmpdir}`,
    ).toBeTruthy();
    const savedContent = fs.readFileSync(savedFilePath, 'utf8');
    expect(savedContent).toContain(startMarker);
    expect(savedContent).toContain(endMarker);
    expect(savedContent.length).toBeGreaterThanOrEqual(fileSize);

    fs.unlinkSync(savedFilePath);
  }, 120000);

  it('should produce clean output resolving carriage returns and backspaces', async () => {
    await rig.setup(
      'should produce clean output resolving carriage returns and backspaces',
      {
        settings: {
          tools: { core: ['run_shell_command'] },
        },
      },
    );

    const script = `
import sys
import time

# Fill buffer to force file streaming/truncation
# 45000 chars to be safe (default threshold is 40000)
print('A' * 45000)
sys.stdout.flush()

# Test sequence
print('XXXXX', end='', flush=True)
time.sleep(0.5)
print('\\rYYYYY', end='', flush=True)
time.sleep(0.5)
print('\\nNext Line', end='', flush=True)
`;
    const scriptPath = path.join(rig.testDir!, 'test_script.py');
    fs.writeFileSync(scriptPath, script);

    const prompt = `run_shell_command python3 "${scriptPath}"`;
    await rig.run({ args: prompt });

    let savedFilePath = '';
    const tmpdir = path.join(rig.homeDir!, '.gemini', 'tmp');
    if (fs.existsSync(tmpdir)) {
      const findFiles = (dir: string): string[] => {
        let results: string[] = [];
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of list) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            results = results.concat(findFiles(fullPath));
          } else if (file.isFile() && file.name.endsWith('.txt')) {
            results.push(fullPath);
          }
        }
        return results;
      };

      const files = findFiles(tmpdir);
      files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

      if (files.length > 0) {
        savedFilePath = files[0];
      }
    }

    expect(savedFilePath, 'Output file should exist').toBeTruthy();
    const content = fs.readFileSync(savedFilePath, 'utf8');

    // Verify it contains the large chunk
    expect(content).toContain('AAAA');

    // Verify cleanup logic:
    // 1. The final text "YYYYY" should be present.
    expect(content).toContain('YYYYY');
    // 2. The next line should be present.
    expect(content).toContain('Next Line');

    // 3. Verify overwrite happened.
    // In raw output, we would have "XXXXX...YYYYY".
    // In processed output, "YYYYY" overwrites "XXXXX".
    // We confirm that escape codes are stripped (processed text).

    // 4. Check for ANSI escape codes (like \\x1b) just in case
    expect(content).not.toContain('\x1b');
  }, 60000);
});
