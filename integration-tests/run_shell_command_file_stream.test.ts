/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

    await rig.waitForToolCall('run_shell_command', 20000);

    let savedFilePath = '';
    const tmpdir = os.tmpdir();
    const tmpFiles = fs.readdirSync(tmpdir);
    for (const file of tmpFiles) {
      if (file.startsWith('gemini_shell_output_') && file.endsWith('.log')) {
        const p = path.join(tmpdir, file);
        const stat = fs.statSync(p);
        if (Date.now() - stat.mtimeMs < 60000 && stat.size >= 20000000) {
          savedFilePath = p;
        }
      }
    }

    expect(savedFilePath).toBeTruthy();
    const savedContent = fs.readFileSync(savedFilePath, 'utf8');
    expect(savedContent).toContain(startMarker);
    expect(savedContent).toContain(endMarker);
    expect(savedContent.length).toBeGreaterThanOrEqual(fileSize);

    fs.unlinkSync(savedFilePath);
  }, 120000);
});
