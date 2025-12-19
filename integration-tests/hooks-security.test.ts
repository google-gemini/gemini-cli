/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('Hooks Security Integration', () => {
  let rig: TestRig;
  let tempTrustedFoldersPath: string;
  let tempDir: string;

  beforeEach(() => {
    rig = new TestRig();
    // Create a temp file for trusted folders to ensure clean state
    tempDir = mkdtempSync(join(tmpdir(), 'gemini-cli-test-'));
    tempTrustedFoldersPath = join(tempDir, 'trustedFolders.json');
    writeFileSync(tempTrustedFoldersPath, '{}'); // Empty config, so nothing is trusted
    process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'] = tempTrustedFoldersPath;
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'];
  });

  it('should NOT execute project hooks when folder is untrusted', async () => {
    const hookCommand =
      'echo "{"decision": "allow", "systemMessage": "SECURITY BREACH: Hook executed in untrusted folder"}"';

    await rig.setup(
      'should NOT execute project hooks when folder is untrusted',
      {
        settings: {
          security: {
            folderTrust: {
              enabled: true,
            },
          },
          tools: {
            enableHooks: true,
          },
          hooks: {
            BeforeTool: [
              {
                matcher: 'write_file',
                hooks: [
                  {
                    type: 'command',
                    command: hookCommand,
                    timeout: 5000,
                  },
                ],
              },
            ],
          },
        },
      },
    );

    const result = await rig.run({
      args: 'Create a file called test.txt with content "hello"',
    });

    // The hook should NOT have executed
    expect(result).not.toContain('SECURITY BREACH');

    // Check hook telemetry - should be empty
    const hookLogs = rig.readHookLogs();
    const hookLog = hookLogs.find(
      (log) => log.hookCall.hook_name === hookCommand,
    );
    expect(hookLog).toBeUndefined();
  });

  it('should execute project hooks when folder IS trusted', async () => {
    const hookCommand =
      'echo "{"decision": "allow", "systemMessage": "SAFE: Hook executed in trusted folder"}"';

    const testName = 'should execute project hooks when folder IS trusted';

    await rig.setup(testName, {
      settings: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
        tools: {
          enableHooks: true,
        },
        hooks: {
          BeforeTool: [
            {
              matcher: 'write_file',
              hooks: [
                {
                  type: 'command',
                  command: hookCommand,
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      },
    });

    // Now rig.testDir is populated
    // We can update the trusted folders file now.
    const trustConfig = {
      [rig.testDir!]: 'TRUST_FOLDER',
    };
    writeFileSync(tempTrustedFoldersPath, JSON.stringify(trustConfig));

    const result = await rig.run({
      args: 'Create a file called trusted.txt with content "safe"',
    });

    // The hook SHOULD have executed
    expect(result).toContain('SAFE: Hook executed');

    // Check hook telemetry
    const hookLogs = rig.readHookLogs();
    const hookLog = hookLogs.find(
      (log) => log.hookCall.hook_name === hookCommand,
    );
    expect(hookLog).toBeDefined();
  });
});
