/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { TestRig } from './test-helper.js';
import fs from 'node:fs';

describe('Workspace Override', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should override settings when --workspace is used', async () => {
    // 1. Setup the rig normally. This creates a default workspace in rig.testDir.
    rig.setup('workspace-override-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'workspace-override.responses',
      ),
    });

    // 2. Create an override workspace directory INSIDE rig.testDir.
    const overrideWsPath = join(rig.testDir!, 'override-ws');
    fs.mkdirSync(overrideWsPath, { recursive: true });

    // Create .gemini directory in the override workspace
    const overrideGeminiDir = join(overrideWsPath, '.gemini');
    fs.mkdirSync(overrideGeminiDir, { recursive: true });

    // Create settings.json with a distinct model in the override workspace
    const overrideModel = 'overridden-model-123';
    fs.writeFileSync(
      join(overrideGeminiDir, 'settings.json'),
      JSON.stringify({
        general: {
          modelRouting: false,
        },
        model: {
          name: overrideModel,
        },
      }),
    );

    // 3. Run gemini with --workspace pointing to the override directory.
    // We use a simple prompt.
    // Note: We need to use rig.run which spawns the CLI.
    const result = await rig.run({
      args: ['--workspace', overrideWsPath, '-p', 'Hello'],
      env: {
        GEMINI_API_KEY: 'dummy-key',
      },
    });

    // 4. Verify that the requested model was the overridden one.
    // The TestRig records API requests in telemetry.log.
    await rig.waitForTelemetryEvent('api_request');
    const lastRequest = rig.readLastApiRequest();

    expect(lastRequest).toBeDefined();
    // In telemetry logs, the model is usually stored in attributes.model
    expect(lastRequest?.attributes?.model).toBe(overrideModel);

    // Also verify the output contains our fake response just to be sure
    expect(result).toContain('Hello from override!');
  });

  it('should throw error for non-existent workspace', async () => {
    rig.setup('workspace-non-existent-test');

    const nonExistentPath = join(rig.testDir!, 'does-not-exist');

    try {
      await rig.run({
        args: ['--workspace', nonExistentPath, '-p', 'Hello'],
        env: {
          GEMINI_API_KEY: 'dummy-key',
        },
      });
      throw new Error('Expected rig.run to throw an error');
    } catch (error: unknown) {
      const err = error as Error;
      expect(err.message).toContain('Error processing workspace path');
      expect(err.message).toContain('does not exist');
    }
  });

  it('should execute tools in the specified workspace', async () => {
    rig.setup('execution-proof-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'workspace-override-tool.responses',
      ),
    });
    const overrideWsPath = join(rig.testDir!, 'override-ws');
    fs.mkdirSync(overrideWsPath, { recursive: true });

    await rig.run({
      args: [
        '--workspace',
        overrideWsPath,
        '-p',
        'Create a file named "proof.txt" with content "success"',
      ],
      env: {
        GEMINI_API_KEY: 'dummy-key',
      },
    });

    const proofFile = join(overrideWsPath, 'proof.txt');
    expect(fs.existsSync(proofFile)).toBe(true);
    expect(fs.readFileSync(proofFile, 'utf-8')).toBe('success');
  });
});
