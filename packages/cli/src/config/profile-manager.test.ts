/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProfileManager } from './profile-manager.js';
import { type LoadedSettings } from './settings.js';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: mockHomedir,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

describe('ProfileManager', () => {
  let tempHomeDir: string;
  let profilesDir: string;
  let mockSettings: LoadedSettings;
  let manager: ProfileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-profile-test-'),
    );
    vi.stubEnv('GEMINI_CLI_HOME', tempHomeDir);

    profilesDir = path.join(tempHomeDir, '.gemini', 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });

    mockSettings = {
      merged: {
        general: {
          activeProfile: undefined,
        },
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    manager = new ProfileManager(mockSettings);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should list available profiles', async () => {
    fs.writeFileSync(path.join(profilesDir, 'coding.md'), '# Coding Profile');
    fs.writeFileSync(path.join(profilesDir, 'writing.md'), '# Writing Profile');
    fs.writeFileSync(path.join(profilesDir, 'not-a-profile.txt'), 'test');

    const profiles = await manager.listProfiles();
    expect(profiles.sort()).toEqual(['coding', 'writing']);
  });

  it('should return empty list if profiles directory does not exist', async () => {
    fs.rmSync(profilesDir, { recursive: true, force: true });
    const profiles = await manager.listProfiles();
    expect(profiles).toEqual([]);
  });

  it('should ensure profiles directory exists', async () => {
    fs.rmSync(profilesDir, { recursive: true, force: true });
    expect(fs.existsSync(profilesDir)).toBe(false);
    await manager.ensureProfilesDir();
    expect(fs.existsSync(profilesDir)).toBe(true);
  });

  it('should get a profile with frontmatter and context', async () => {
    const content = `---
name: coding
description: For coding tasks
extensions: [git, shell]
default_model: gemini-2.0-flash
---
Use these instructions for coding.`;
    fs.writeFileSync(path.join(profilesDir, 'coding.md'), content);

    const profile = await manager.getProfile('coding');
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('coding');
    expect(profile?.frontmatter.extensions).toEqual(['git', 'shell']);
    expect(profile?.frontmatter.default_model).toBe('gemini-2.0-flash');
    expect(profile?.context).toBe('Use these instructions for coding.');
  });

  it('should throw if profile name does not match filename', async () => {
    const content = `---
name: wrong-name
extensions: []
---`;
    fs.writeFileSync(path.join(profilesDir, 'test.md'), content);

    await expect(manager.getProfile('test')).rejects.toThrow(
      /Profile name in frontmatter \(wrong-name\) must match filename \(test\)/,
    );
  });

  it('should handle optional extensions field', async () => {
    const content = `---
name: test-no-ext
---
Body`;
    fs.writeFileSync(path.join(profilesDir, 'test-no-ext.md'), content);

    const profile = await manager.getProfile('test-no-ext');
    expect(profile?.frontmatter.extensions).toBeUndefined();
    expect(profile?.context).toBe('Body');
  });

  it('should throw if mandatory frontmatter is missing', async () => {
    const content = `Just some text without dashes`;
    fs.writeFileSync(path.join(profilesDir, 'no-fm.md'), content);
    await expect(manager.getProfile('no-fm')).rejects.toThrow(
      /missing mandatory YAML frontmatter/,
    );
  });

  it('should throw if YAML is malformed', async () => {
    const content = `---
name: [invalid yaml
---
Body`;
    fs.writeFileSync(path.join(profilesDir, 'bad-yaml.md'), content);
    await expect(manager.getProfile('bad-yaml')).rejects.toThrow(
      /Failed to parse profile/,
    );
  });

  it('should throw if validation fails (invalid slug)', async () => {
    const content = `---
name: Invalid Name
---`;
    fs.writeFileSync(path.join(profilesDir, 'invalid-slug.md'), content);
    await expect(manager.getProfile('invalid-slug')).rejects.toThrow(
      /Validation failed.*name/,
    );
  });

  it('should return null for non-existent profile', async () => {
    const profile = await manager.getProfile('ghost');
    expect(profile).toBeNull();
  });

  it('should uninstall a profile', async () => {
    const profilePath = path.join(profilesDir, 'coding.md');
    fs.writeFileSync(profilePath, '---\nname: coding\nextensions: []\n---');

    await manager.uninstallProfile('coding');
    expect(fs.existsSync(profilePath)).toBe(false);
  });

  it('should disable profile before uninstalling if active', async () => {
    const profilePath = path.join(profilesDir, 'active.md');
    fs.writeFileSync(profilePath, '---\nname: active\nextensions: []\n---');

    mockSettings.merged.general.activeProfile = 'active';

    await manager.uninstallProfile('active');
    expect(fs.existsSync(profilePath)).toBe(false);
    expect(mockSettings.setValue).toHaveBeenCalledWith(
      expect.anything(),
      'general.activeProfile',
      undefined,
    );
  });
});
