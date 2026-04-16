/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import { loadForumPresets } from './preset-loader.js';
import { Storage } from '../config/storage.js';
import type { Config } from '../config/config.js';

describe('loadForumPresets', () => {
  let tempRoot: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('loads user and workspace presets and lets workspace override by name', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'forum-presets-'));
    const userDir = path.join(tempRoot, 'user-forums');
    const projectDir = path.join(tempRoot, 'project-forums');
    await fs.mkdir(userDir, { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });

    await fs.writeFile(
      path.join(userDir, 'design.json'),
      JSON.stringify({
        name: 'design',
        members: [
          {
            memberId: 'architect',
            agentName: 'codebase-investigator',
            temperature: 0.2,
          },
        ],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(projectDir, 'design.json'),
      JSON.stringify({
        name: 'design',
        maxRounds: 4,
        members: [
          {
            memberId: 'planner',
            agentName: 'codebase-investigator',
            tools: ['read_file'],
          },
        ],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(projectDir, 'review.json'),
      JSON.stringify({
        name: 'review',
        members: [
          {
            memberId: 'skeptic',
            agentName: 'codebase-investigator',
            topP: 0.9,
          },
        ],
      }),
      'utf8',
    );

    vi.spyOn(Storage, 'getUserForumsDir').mockReturnValue(userDir);

    const config = {
      storage: {
        getProjectForumsDir: () => projectDir,
      },
    } as unknown as Config;

    const presets = await loadForumPresets(config);

    expect(presets).toHaveLength(2);
    expect(presets.map((preset) => preset.name)).toEqual(['design', 'review']);
    expect(presets[0]).toMatchObject({
      name: 'design',
      maxRounds: 4,
      members: [
        {
          memberId: 'planner',
          toolConfig: { tools: ['read_file'] },
        },
      ],
      source: {
        scope: 'workspace',
      },
    });
    expect(presets[1]).toMatchObject({
      name: 'review',
      members: [
        {
          memberId: 'skeptic',
          modelConfig: {
            generateContentConfig: {
              topP: 0.9,
            },
          },
        },
      ],
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        presets[1].members[0].modelConfig ?? {},
        'model',
      ),
    ).toBe(false);
  });
});
