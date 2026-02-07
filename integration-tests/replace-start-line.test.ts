/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('replace with start_line', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should use start_line to replace the second occurrence', async () => {
    await rig.setup('should use start_line to replace the second occurrence', {
      settings: { tools: { core: ['replace', 'read_file'] } },
    });

    const fileName = 'multiple_matches.txt';
    const originalContent = ['match', 'match', 'match'].join('\n');
    const expectedContent = ['match', 'replaced', 'match'].join('\n');

    rig.createFile(fileName, originalContent);

    await rig.run({
      args: `In ${fileName}, replace 'match' with 'replaced' at line 2. Use the start_line parameter set to 2.`,
    });

    const found = await rig.waitForToolCall('replace');
    expect(found, 'Expected to find a replace tool call').toBeTruthy();

    const toolLogs = rig.readToolLogs();
    const replaceLog = toolLogs.find(
      (log) => log.toolRequest.name === 'replace',
    );
    expect(replaceLog).toBeTruthy();

    const args = JSON.parse(replaceLog!.toolRequest.args);
    // Check if start_line was actually used in the tool call
    expect(args.start_line).toBe(2);

    expect(rig.readFile(fileName)).toBe(expectedContent);
  });
});
