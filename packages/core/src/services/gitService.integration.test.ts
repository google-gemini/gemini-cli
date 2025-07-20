/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest';
import { GitService } from './gitService.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { simpleGit, SimpleGit } from 'simple-git';

// This is the directory where we will create our temporary test projects.
const TEST_DIR = path.join(
  process.cwd(),
  '.gemini-test-dir-deleteme-git-service-integration',
);

afterAll(async () => {
  // Clean up the temporary directory after all tests are done.
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe('GitService [integration]', () => {
  let testRootDir: string;
  let projectDir: string;
  let git: SimpleGit;

  beforeEach(async () => {
    // Create a unique directory for each test run.
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'git-service-integration-test-'),
    );
    projectDir = path.join(testRootDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });

    // Initialize a git repository in the project directory.
    git = simpleGit(projectDir);
    await git.init();

    // Set a specific user name and email for this repository.
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
  });

  afterEach(async () => {
    // Clean up the project directory after each test.
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should not modify the user git config when creating a snapshot', async () => {
    const service = new GitService(projectDir);
    await service.initialize();

    await fs.writeFile(path.join(projectDir, 'test.txt'), 'hello world');
    await service.createFileSnapshot('test snapshot');

    const config = await git.listConfig();
    expect(config.all['user.name']).toBe('Test User');
    expect(config.all['user.email']).toBe('test@example.com');
  });

  it('should not overwrite local git config (deterministic)', async () => {
    // 1. Create a controller to pause/resume the `init` process
    let initializationController: { resolve: () => void };
    const initPromise = new Promise<void>((resolve) => {
      initializationController = { resolve };
    });

    // 2. Create a mock git instance with a fake `init` method
    const mockGit = {
      init: vi.fn().mockReturnValue(initPromise),
      // Mock other methods used in `initialize` as needed
      checkIsRepo: vi.fn().mockResolvedValue(false),
      commit: vi.fn().mockResolvedValue({ commit: 'initial' }),
      add: vi.fn(),
      // We need a real config for the final assertion
      listConfig: simpleGit(projectDir).listConfig,
    };

    // 3. Create a factory that returns our mock
    const mockGitFactory = () => mockGit as unknown as SimpleGit;

    // 4. Inject the mock factory into the service
    const service = new GitService(projectDir, mockGitFactory);

    // 5. Start initialization. It will now PAUSE on our `initPromise`.
    const initPromiseFromService = service.initialize();

    // 6. Now, we can deterministically run the code that would have raced.
    // This will fail because the repo isn't "initialized" yet.
    try {
      await fs.writeFile(path.join(projectDir, 'race.txt'), 'race test');
      await service.createFileSnapshot('potential race');
    } catch (e) {
      const err = e as Error;
      // This is the expected error, since the git repo is not yet initialized.
      // We are making sure that the error is related to git, and not something
      // else, like an fs error.
      expect(err.message.toLocaleLowerCase()).toContain('git');
    }

    // 7. "Resume" the initialization process
    initializationController!.resolve();
    await initPromiseFromService;

    // 8. Final assertion: check that the user's config was never touched.
    const config = await git.listConfig();
    expect(config.all['user.name']).toBe('Test User');
    expect(config.all['user.email']).toBe('test@example.com');
  });

  it('should copy .gitignore from projectRoot if it exists', async () => {
    const gitignoreContent = 'node_modules/\n.env';
    const visibleGitIgnorePath = path.join(projectDir, '.gitignore');
    await fs.writeFile(visibleGitIgnorePath, gitignoreContent);

    const service = new GitService(projectDir);
    await service.initialize();

    const historyDir = (
      service as unknown as { getHistoryDir: () => string }
    ).getHistoryDir();
    const hiddenGitIgnorePath = path.join(historyDir, '.gitignore');
    const copiedContent = await fs.readFile(hiddenGitIgnorePath, 'utf-8');
    expect(copiedContent).toBe(gitignoreContent);
  });
});
