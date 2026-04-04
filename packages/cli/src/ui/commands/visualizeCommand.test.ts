/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { visualizeCommand } from './visualizeCommand.js';

describe('visualizeCommand', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('exposes the expected six subcommands', () => {
    const names = visualizeCommand.subCommands?.map((sub) => sub.name) ?? [];
    expect(names).toEqual([
      'flowchart',
      'sequence',
      'class',
      'erd',
      'deps',
      'git',
    ]);
  });

  it('returns submit_prompt for flowchart generation', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'flowchart checkout flow with retries',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('Mermaid flowchart diagram');
    expect(contentText).toContain('diagramType: "flowchart"');
  });

  it('returns submit_prompt for sequence generation', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'sequence auth handshake between client and server',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('Mermaid sequence diagram');
    expect(contentText).toContain('diagramType: "sequence"');
  });

  it('returns submit_prompt for class generation', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'class user organization billing model',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('Mermaid class diagram');
    expect(contentText).toContain('diagramType: "class"');
  });

  it('returns submit_prompt for erd generation', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'erd users sessions tokens',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('Mermaid erd diagram');
    expect(contentText).toContain('diagramType: "erd"');
  });

  it('adds vertical layout instructions when flowchart request mentions stack', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'stack with elements 10, 20, 30',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('flowchart TB');
    expect(contentText).toContain('%% layout: stack');
  });

  it('adds horizontal layout instructions when flowchart request mentions queue', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext();
    const result = await visualizeCommand.action(
      context,
      'queue with elements 10, 20, 30',
    );

    expect(result?.type).toBe('submit_prompt');
    if (!result || result.type !== 'submit_prompt') {
      return;
    }

    const contentText = String(result.content);
    expect(contentText).toContain('flowchart LR');
    expect(contentText).toContain('%% layout: queue');
  });

  it('returns a visualize tool call for deps', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'visualize-command-'));
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          dependencies: {
            react: '^19.0.0',
            zod: '^3.0.0',
          },
        },
        null,
        2,
      ),
    );

    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getTargetDir: () => tempDir,
          },
        },
      },
    });

    const result = await visualizeCommand.action(context, 'deps');

    expect(result?.type).toBe('tool');
    if (!result || result.type !== 'tool') {
      return;
    }

    expect(result.toolName).toBe('visualize');
    expect(String(result.toolArgs['mermaid'])).toContain('react');
    expect(String(result.toolArgs['mermaid'])).toContain('zod');
  });

  it('returns a visualize tool call for git', async () => {
    if (!visualizeCommand.action) {
      throw new Error('visualizeCommand.action is not defined');
    }

    const context = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getTargetDir: () => process.cwd(),
          },
        },
      },
    });

    const result = await visualizeCommand.action(context, 'git');

    expect(result?.type).toBe('tool');
    if (!result || result.type !== 'tool') {
      return;
    }

    expect(result.toolName).toBe('visualize');
    expect(String(result.toolArgs['diagramType'])).toBe('flowchart');
    expect(String(result.toolArgs['mermaid'])).toContain('flowchart TB');
  });
});
