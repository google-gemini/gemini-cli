/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TestRig } from './test-helper.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Ctrl+C exit', () => {
  // (#9782) Temporarily disabling on windows because it is failing on main and every
  // PR, which is potentially hiding other failures
  it.skipIf(process.platform === 'win32')(
    'should exit gracefully on second Ctrl+C',
    async () => {
      const rig = new TestRig();
      await rig.setup('should exit gracefully on second Ctrl+C');

      const { ptyProcess, promise } = rig.runInteractive();

      let output = '';
      ptyProcess.onData((data) => {
        output += data;
      });

      // Wait for the app to be ready by looking for the initial prompt indicator
      await rig.poll(() => output.includes('▶'), 5000, 100);

      // Send first Ctrl+C
      ptyProcess.write(String.fromCharCode(3));

      // Wait for the exit prompt
      await rig.poll(
        () => output.includes('Press Ctrl+C again to exit'),
        1500,
        50,
      );

      // Send second Ctrl+C
      ptyProcess.write(String.fromCharCode(3));

      const result = await promise;

      // Expect a graceful exit (code 0)
      expect(
        result.exitCode,
        `Process exited with code ${result.exitCode}. Output: ${result.output}`,
      ).toBe(0);

      // Check that the quitting message is displayed
      const quittingMessage = 'Agent powering down. Goodbye!';
      // The regex below is intentionally matching the ESC control character (\x1b)
      // to strip ANSI color codes from the terminal output.
      // eslint-disable-next-line no-control-regex
      const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
      expect(cleanOutput).toContain(quittingMessage);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'should exit gracefully on second Ctrl+C when calling a tool',
    async () => {
      const rig = new TestRig();
      await rig.setup(
        'should exit gracefully on second Ctrl+C when calling a tool',
      );

      const childProcessFile = 'child_process_file.txt';
      rig.createFile(
        'wait.js',
        `setTimeout(() => require('fs').writeFileSync('${childProcessFile}', 'done'), 5000)`,
      );

      const { ptyProcess, promise } = rig.runInteractive();

      let output = '';
      ptyProcess.onData((data) => {
        output += data;
      });

      // Wait for the app to be ready by looking for the initial prompt indicator
      await rig.poll(() => output.includes('▶'), 5000, 100);

      ptyProcess.write('use the tool to run "node -e wait.js"\n');

      await rig.poll(() => output.includes('Shell'), 5000, 100);

      // Send first Ctrl+C
      ptyProcess.write(String.fromCharCode(3));

      // Wait for the exit prompt
      await rig.poll(
        () => output.includes('Press Ctrl+C again to exit'),
        1500,
        50,
      );

      // Send second Ctrl+C
      ptyProcess.write(String.fromCharCode(3));

      const result = await promise;

      // Expect a graceful exit (code 0)
      expect(
        result.exitCode,
        `Process exited with code ${result.exitCode}. Output: ${result.output}`,
      ).toBe(0);

      // Check that the quitting message is displayed
      const quittingMessage = 'Agent powering down. Goodbye!';
      // The regex below is intentionally matching the ESC control character (\x1b)
      // to strip ANSI color codes from the terminal output.
      // eslint-disable-next-line no-control-regex
      const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
      expect(cleanOutput).toContain(quittingMessage);

      // Check that the child process was terminated and did not create the file.
      const childProcessFileExists = fs.existsSync(
        path.join(rig.testDir!, childProcessFile),
      );
      expect(
        childProcessFileExists,
        'Child process file should not exist',
      ).toBe(false);
    },
  );
});
