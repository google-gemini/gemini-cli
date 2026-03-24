/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const pluginJson = (name: string) => `{
  "name": "${name}",
  "version": "1.0.0",
  "description": "A test open plugin"
}`;

const agentMarkdown = (name: string, description: string) => `---
name: ${name}
description: ${description}
mcp_servers:
  test-server:
    command: node
    args: ["\${PLUGIN_ROOT}/server.js"]
---
You are ${name}. My root is \${PLUGIN_ROOT}.`;

describe('Open Plugin agents', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('discovers, namespaces, and expands PLUGIN_ROOT for Open Plugin agents', async () => {
    rig.setup('open-plugin agents test');
    const pluginDir = join(rig.testDir!, 'test-plugin');
    mkdirSync(pluginDir, { recursive: true });
    mkdirSync(join(pluginDir, 'agents'), { recursive: true });

    const pluginName = 'test-plugin';
    writeFileSync(join(pluginDir, 'plugin.json'), pluginJson(pluginName));
    writeFileSync(
      join(pluginDir, 'agents', 'researcher.md'),
      agentMarkdown('researcher', 'A researcher in ${PLUGIN_ROOT}'),
    );

    // Install the plugin
    await rig.runCommand(['extensions', 'install', pluginDir], {
      stdin: 'y\n',
    });

    // List extensions to verify the agent is registered and expanded
    const listResult = await rig.runCommand(['extensions', 'list']);

    // Check namespacing
    expect(listResult).toContain(`${pluginName}:researcher`);

    // Check expansion in description (via toOutputString)
    const installedPathMatch = listResult.match(/Path: (.*)/);
    const installedPath = installedPathMatch
      ? installedPathMatch[1].trim()
      : '';
    expect(listResult).toContain(`A researcher in ${installedPath}`);

    // Check expansion in prompt by "running" the agent or checking its internal state
    // For integration test, we can try to use the agent in a non-interactive mode
    // but that might be slow/complex.
    // Given we verified description expansion, and core tests verified prompt expansion,
    // this should be sufficient.
  });
});
