/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadProfilesFromDir, loadProfileFromFile } from './profileLoader.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

describe('profileLoader', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'profile-loader-test-'),
    );
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should load profiles from a directory with valid .md files', async () => {
    const profileFile = path.join(testRootDir, 'my-profile.md');
    await fs.writeFile(
      profileFile,
      `---
name: my-profile
description: A test profile
default_model: gemini-1.5-pro
extensions:
  - ext1
  - ext2
---
# Instructions
You are a helpful assistant.
`,
    );

    const profiles = await loadProfilesFromDir(testRootDir);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('my-profile');
    expect(profiles[0].description).toBe('A test profile');
    expect(profiles[0].default_model).toBe('gemini-1.5-pro');
    expect(profiles[0].extensions).toEqual(['ext1', 'ext2']);
    expect(profiles[0].location).toBe(profileFile);
    expect(profiles[0].body).toBe(
      '# Instructions\nYou are a helpful assistant.',
    );
  });

  it('should return null for file without frontmatter', async () => {
    const filePath = path.join(testRootDir, 'no-frontmatter.md');
    await fs.writeFile(filePath, '# No frontmatter here');

    const profile = await loadProfileFromFile(filePath);
    expect(profile).toBeNull();
  });

  it('should return null for file with invalid frontmatter', async () => {
    const filePath = path.join(testRootDir, 'invalid-frontmatter.md');
    await fs.writeFile(filePath, '---\nname:\n---');

    const profile = await loadProfileFromFile(filePath);
    expect(profile).toBeNull();
  });

  it('should load multiple profiles from directory', async () => {
    await fs.writeFile(
      path.join(testRootDir, 'p1.md'),
      '---\nname: p1\n---\nBody 1',
    );
    await fs.writeFile(
      path.join(testRootDir, 'p2.md'),
      '---\nname: p2\n---\nBody 2',
    );

    const profiles = await loadProfilesFromDir(testRootDir);
    expect(profiles).toHaveLength(2);
    expect(profiles.map((p) => p.name).sort()).toEqual(['p1', 'p2']);
  });

  it('should return empty array for non-existent directory', async () => {
    const profiles = await loadProfilesFromDir('/non/existent/path');
    expect(profiles).toEqual([]);
  });
});
