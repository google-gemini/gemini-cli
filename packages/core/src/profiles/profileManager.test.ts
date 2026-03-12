/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProfileManager } from './profileManager.js';
import { coreEvents } from '../utils/events.js';

describe('ProfileManager', () => {
  let testProfilesDir: string;
  let profileManager: ProfileManager;

  beforeEach(async () => {
    testProfilesDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'profile-manager-test-'),
    );
    profileManager = new ProfileManager(testProfilesDir);
    vi.spyOn(coreEvents, 'emitFeedback');
  });

  afterEach(async () => {
    await fs.rm(testProfilesDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should load profiles from directory', async () => {
    await fs.writeFile(
      path.join(testProfilesDir, 'test.md'),
      '---\nname: test\n---\nBody',
    );
    await profileManager.load();
    const profiles = profileManager.getAllProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('test');
  });

  it('should manage active profile', async () => {
    await fs.writeFile(
      path.join(testProfilesDir, 'my-profile.md'),
      '---\nname: my-profile\n---\nBody',
    );
    await profileManager.load();
    profileManager.setActiveProfile('my-profile');
    expect(profileManager.getActiveProfileName()).toBe('my-profile');
  });

  it('should install profile by copying', async () => {
    const sourceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'source-profile-'),
    );
    const sourceFile = path.join(sourceDir, 'new-profile.md');
    await fs.writeFile(sourceFile, '---\nname: new-profile\n---\nNew Body');

    const installed = await profileManager.installProfile(sourceFile);
    expect(installed).toBeDefined();
    expect(installed.name).toBe('new-profile');
    expect(installed.location).toBe(
      path.join(testProfilesDir, 'new-profile.md'),
    );

    const profiles = profileManager.getAllProfiles();
    expect(profiles.find((p) => p.name === 'new-profile')).toBeDefined();
  });

  it('should link profile using symlink', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-link-'));
    const sourceFile = path.join(sourceDir, 'linked-profile.md');
    await fs.writeFile(
      sourceFile,
      '---\nname: linked-profile\n---\nLinked Body',
    );

    const linked = await profileManager.linkProfile(sourceFile);
    expect(linked).toBeDefined();
    expect(linked.name).toBe('linked-profile');

    const targetPath = path.join(testProfilesDir, 'linked-profile.md');
    const stats = await fs.lstat(targetPath);
    expect(stats.isSymbolicLink()).toBe(true);
  });

  it('should reload profiles', async () => {
    await profileManager.load();
    expect(profileManager.getAllProfiles()).toHaveLength(0);

    await fs.writeFile(
      path.join(testProfilesDir, 'test.md'),
      '---\nname: test\n---\nBody',
    );
    await profileManager.load();
    expect(profileManager.getAllProfiles()).toHaveLength(1);
  });
});
