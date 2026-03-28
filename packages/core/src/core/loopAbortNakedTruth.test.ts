/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

describe('GeminiClient (Real World Loop Survival)', () => {
  it('should survive the "Naked Truth" prompt without hard-crashing', () => {
    // 1. Setup: Point to the root of the current workspace
    const rootDir = path.resolve(__dirname, '../../../../');

    // 2. Act: Run the REAL CLI with the loop-inducing prompt
    // We use -y for auto-approve and -p for the prompt.
    const command =
      'npm start -- -y -p "Repeat the following sequence exactly 50 times in one continuous line without any line breaks: la li lu le lo"';

    // eslint-disable-next-line no-console
    console.log('Executing Real-World Slay Command...');

    try {
      execSync(command, {
        cwd: rootDir,
        stdio: 'inherit', // Stream output to console so we can see the "Slay"
        env: { ...process.env, NODE_ENV: 'development' },
      });

      // 3. Assert: If we reached here, the exit code was 0!
      expect(true).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // If it crashes (Exit Code 1), execSync throws.
      // eslint-disable-next-line no-console
      console.error('REAL WORLD CRASH DETECTED:', error.message);
      throw new Error(
        `The CLI hard-crashed with Exit Code ${error.status}! The Pacifist Defense has failed!`,
      );
    }
  }, 120000); // 120s timeout because it's a full app run!
});
