/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.unmock('./projectRegistry.js');

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectRegistry } from './projectRegistry.js';
import { lock } from 'proper-lockfile';

vi.mock('proper-lockfile');

describe('ProjectRegistry', () => {
  let tempDir: string;
  let registryPath: string;
  let baseDir1: string;
  let baseDir2: string;

  function normalizePath(p: string): string {
    let resolved = path.resolve(p);
    if (os.platform() === 'win32') {
      resolved = resolved.toLowerCase();
    }
    return resolved;
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-registry-test-'));
    registryPath = path.join(tempDir, 'projects.json');
    baseDir1 = path.join(tempDir, 'base1');
    baseDir2 = path.join(tempDir, 'base2');
    fs.mkdirSync(baseDir1);
    fs.mkdirSync(baseDir2);

    vi.mocked(lock).mockResolvedValue(vi.fn().mockResolvedValue(undefined));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('generates a short ID from the basename', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const projectPath = path.join(tempDir, 'my-project');
    const shortId = await registry.getShortId(projectPath);
    expect(shortId).toBe('my-project');
  });

  it('slugifies the project name', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const projectPath = path.join(tempDir, 'My Project! @2025');
    const shortId = await registry.getShortId(projectPath);
    expect(shortId).toBe('my-project-2025');
  });

  it('handles collisions with unique suffixes', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();

    const id1 = await registry.getShortId(path.join(tempDir, 'one', 'gemini'));
    const id2 = await registry.getShortId(path.join(tempDir, 'two', 'gemini'));
    const id3 = await registry.getShortId(
      path.join(tempDir, 'three', 'gemini'),
    );

    expect(id1).toBe('gemini');
    expect(id2).toBe('gemini-1');
    expect(id3).toBe('gemini-2');
  });

  it('persists and reloads the registry', async () => {
    const projectPath = path.join(tempDir, 'project-a');
    const registry1 = new ProjectRegistry(registryPath);
    await registry1.initialize();
    await registry1.getShortId(projectPath);

    const registry2 = new ProjectRegistry(registryPath);
    await registry2.initialize();
    const id = await registry2.getShortId(projectPath);

    expect(id).toBe('project-a');

    const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    // Use the actual normalized path as key
    const normalizedPath = normalizePath(projectPath);
    expect(data.projects[normalizedPath]).toBe('project-a');
  });

  it('normalizes paths', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();
    const path1 = path.join(tempDir, 'project');
    const path2 = path.join(path1, '..', 'project');

    const id1 = await registry.getShortId(path1);
    const id2 = await registry.getShortId(path2);

    expect(id1).toBe(id2);
  });

  it('creates ownership markers in base directories', async () => {
    const registry = new ProjectRegistry(registryPath, [baseDir1, baseDir2]);
    await registry.initialize();
    const projectPath = normalizePath(path.join(tempDir, 'project-x'));
    const shortId = await registry.getShortId(projectPath);

    expect(shortId).toBe('project-x');

    const marker1 = path.join(baseDir1, shortId, '.project_root');
    const marker2 = path.join(baseDir2, shortId, '.project_root');

    expect(normalizePath(fs.readFileSync(marker1, 'utf8'))).toBe(projectPath);
    expect(normalizePath(fs.readFileSync(marker2, 'utf8'))).toBe(projectPath);
  });

  it('recovers mapping from disk if registry is missing it', async () => {
    // 1. Setup a project with ownership markers
    const projectPath = normalizePath(path.join(tempDir, 'project-x'));
    const slug = 'project-x';
    const slugDir = path.join(baseDir1, slug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, '.project_root'), projectPath);

    // 2. Initialize registry (it has no projects.json)
    const registry = new ProjectRegistry(registryPath, [baseDir1, baseDir2]);
    await registry.initialize();

    // 3. getShortId should find it from disk
    const shortId = await registry.getShortId(projectPath);
    expect(shortId).toBe(slug);

    // 4. It should have populated the markers in other base dirs too
    const marker2 = path.join(baseDir2, slug, '.project_root');
    expect(normalizePath(fs.readFileSync(marker2, 'utf8'))).toBe(projectPath);
  });

  it('handles collisions if a slug is taken on disk by another project', async () => {
    // 1. project-y takes 'gemini' on disk
    const projectY = normalizePath(path.join(tempDir, 'project-y'));
    const slug = 'gemini';
    const slugDir = path.join(baseDir1, slug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, '.project_root'), projectY);

    // 2. project-z tries to get shortId for 'gemini'
    const registry = new ProjectRegistry(registryPath, [baseDir1]);
    await registry.initialize();
    const projectZ = normalizePath(path.join(tempDir, 'gemini'));
    const shortId = await registry.getShortId(projectZ);

    // 3. It should avoid 'gemini' and pick 'gemini-1' (or similar)
    expect(shortId).not.toBe('gemini');
    expect(shortId).toBe('gemini-1');
  });

  it('invalidates registry mapping if disk ownership changed', async () => {
    // 1. Registry thinks my-project owns 'my-project'
    const projectPath = normalizePath(path.join(tempDir, 'my-project'));
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [projectPath]: 'my-project',
        },
      }),
    );

    // 2. But disk says project-b owns 'my-project'
    const slugDir = path.join(baseDir1, 'my-project');
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, '.project_root'),
      normalizePath(path.join(tempDir, 'project-b')),
    );

    // 3. my-project asks for its ID
    const registry = new ProjectRegistry(registryPath, [baseDir1]);
    await registry.initialize();
    const id = await registry.getShortId(projectPath);

    // 4. It should NOT get 'my-project' because it's owned by project-b on disk.
    // It should get 'my-project-1' instead.
    expect(id).not.toBe('my-project');
    expect(id).toBe('my-project-1');
  });

  it('repairs missing ownership markers in other base directories', async () => {
    const projectPath = normalizePath(path.join(tempDir, 'project-repair'));
    const slug = 'repair-me';

    // 1. Marker exists in base1 but NOT in base2
    const slugDir1 = path.join(baseDir1, slug);
    fs.mkdirSync(slugDir1, { recursive: true });
    fs.writeFileSync(path.join(slugDir1, '.project_root'), projectPath);

    const registry = new ProjectRegistry(registryPath, [baseDir1, baseDir2]);
    await registry.initialize();

    // 2. getShortId should find it and repair base2
    const shortId = await registry.getShortId(projectPath);
    expect(shortId).toBe(slug);

    const marker2 = path.join(baseDir2, slug, '.project_root');
    expect(fs.existsSync(marker2)).toBe(true);
    expect(normalizePath(fs.readFileSync(marker2, 'utf8'))).toBe(projectPath);
  });

  it('heals if both markers are missing but registry mapping exists', async () => {
    const projectPath = normalizePath(path.join(tempDir, 'project-heal-both'));
    const slug = 'heal-both';

    // 1. Registry has the mapping
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [projectPath]: slug,
        },
      }),
    );

    // 2. No markers on disk
    const registry = new ProjectRegistry(registryPath, [baseDir1, baseDir2]);
    await registry.initialize();

    // 3. getShortId should recreate them
    const id = await registry.getShortId(projectPath);
    expect(id).toBe(slug);

    expect(fs.existsSync(path.join(baseDir1, slug, '.project_root'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(baseDir2, slug, '.project_root'))).toBe(
      true,
    );
    expect(
      normalizePath(
        fs.readFileSync(path.join(baseDir1, slug, '.project_root'), 'utf8'),
      ),
    ).toBe(projectPath);
  });

  it('handles corrupted (unreadable) ownership markers by picking a new slug', async () => {
    const projectPath = normalizePath(path.join(tempDir, 'corrupt-slug'));
    const slug = 'corrupt-slug';

    // 1. Marker exists but is owned by someone else
    const slugDir = path.join(baseDir1, slug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, '.project_root'),
      normalizePath(path.join(tempDir, 'something-else')),
    );

    // 2. Registry also thinks we own it
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          [projectPath]: slug,
        },
      }),
    );

    const registry = new ProjectRegistry(registryPath, [baseDir1]);
    await registry.initialize();

    // 3. It should see the collision/corruption and pick a new one
    const id = await registry.getShortId(projectPath);
    expect(id).toBe(`${slug}-1`);
  });

  it('throws on lock timeout', async () => {
    const registry = new ProjectRegistry(registryPath);
    await registry.initialize();

    vi.mocked(lock).mockRejectedValue(new Error('Lock timeout'));

    await expect(registry.getShortId('/foo')).rejects.toThrow('Lock timeout');
    expect(lock).toHaveBeenCalledWith(
      registryPath,
      expect.objectContaining({
        retries: expect.any(Object),
      }),
    );
  });

  it('throws if not initialized', async () => {
    const registry = new ProjectRegistry(registryPath);
    await expect(registry.getShortId('/foo')).rejects.toThrow(
      'ProjectRegistry must be initialized before use',
    );
  });
});
