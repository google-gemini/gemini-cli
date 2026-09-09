/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { execSync, spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Minimal 1x1 PNG image base64
const DUMMY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Linux Clipboard Integration', () => {
  let rig: TestRig;
  let dummyImagePath: string;

  beforeEach(() => {
    rig = new TestRig();
    // Create a dummy image file for testing
    dummyImagePath = path.join(
      os.tmpdir(),
      `gemini-test-clipboard-${Date.now()}.png`,
    );
    fs.writeFileSync(dummyImagePath, Buffer.from(DUMMY_PNG_BASE64, 'base64'));
  });

  afterEach(async () => {
    await rig.cleanup();
    try {
      if (fs.existsSync(dummyImagePath)) {
        fs.unlinkSync(dummyImagePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  // Only run this test on Linux
  const runIfLinux = os.platform() === 'linux' ? it : it.skip;

  runIfLinux(
    'should paste image from system clipboard when Ctrl+V is pressed',
    async () => {
      // 1. Setup rig
      await rig.setup('linux-clipboard-paste');

      // 2. Inject image into system clipboard
      // We attempt both Wayland and X11 tools.
      let clipboardSet = false;

      // Try wl-copy (Wayland)
      let sessionType = '';
      const wlCopy = spawnSync('wl-copy', ['--type', 'image/png'], {
        input: fs.readFileSync(dummyImagePath),
      });
      if (wlCopy.status === 0) {
        clipboardSet = true;
        sessionType = 'wayland';
      } else {
        // Try xclip (X11)
        try {
          execSync(
            `xclip -selection clipboard -t image/png -i "${dummyImagePath}"`,
            { stdio: 'ignore' },
          );
          clipboardSet = true;
          sessionType = 'x11';
        } catch {
          // Both failed
        }
      }

      if (!clipboardSet) {
        console.warn(
          'Skipping test: Could not access system clipboard (wl-copy or xclip required)',
        );
        return;
      }

      // 3. Launch CLI and simulate Ctrl+V
      // We send the control character \u0016 (SYN) which corresponds to Ctrl+V
      // Note: The CLI must be running and accepting input.
      // The TestRig usually sends args/stdin and waits for exit or output.
      // To properly test "interactive" pasting, we need the rig to support sending input *while* running.
      // Assuming rig.run with 'stdin' sends it immediately.
      // The CLI treats stdin as typed input if it's interactive.

      // We append a small delay or a newline to ensure processing?
      // Ctrl+V (\u0016) followed by a newline (\r) to submit?
      // Or just Ctrl+V and check if the buffer updates (which we can't easily see in non-verbose rig output).
      // If we send Ctrl+V then Enter, the CLI should submit the prompt containing the image path.

      const result = await rig.run({
        stdin: '\u0016\r', // Ctrl+V then Enter
        env: { XDG_SESSION_TYPE: sessionType },
      });

      // 4. Verify Output
      // Expect the CLI to have processed the image and echoed back the path (or the prompt containing it)
      // The output usually contains the user's input echoed back + model response.
      // The pasted image path should look like @.../clipboard-....png
      expect(result).toMatch(/@\/.*\.gemini-clipboard\/clipboard-.*\.png/);
    },
  );
});
