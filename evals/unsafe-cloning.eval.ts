/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { evalTest, TestRig } from './test-helper.js';

evalTest('USUALLY_PASSES', {
  name: 'Reproduction: Agent uses Object.create() for cloning/delegation',
  prompt:
    'Create a utility function `createScopedConfig(config: Config, additionalDirectories: string[]): Config` in `packages/core/src/config/scoped-config.ts` that returns a new Config instance. This instance should override `getWorkspaceContext()` to include the additional directories, but delegate all other method calls (like `isPathAllowed` or `validatePathAccess`) to the original config. Note that `Config` is a complex class with private state and cannot be easily shallow-copied or reconstructed.',
  files: {
    'packages/core/src/config/config.ts': `
export class Config {
  private _internalState = 'secret';
  constructor(private workspaceContext: any) {}
  getWorkspaceContext() { return this.workspaceContext; }
  isPathAllowed(path: string) {
    return this.getWorkspaceContext().isPathWithinWorkspace(path);
  }
  validatePathAccess(path: string) {
    if (!this.isPathAllowed(path)) return 'Denied';
    return null;
  }
}`,
    'packages/core/src/utils/workspaceContext.ts': `
export class WorkspaceContext {
  constructor(private root: string, private additional: string[] = []) {}
  getDirectories() { return [this.root, ...this.additional]; }
  isPathWithinWorkspace(path: string) {
    return this.getDirectories().some(d => path.startsWith(d));
  }
}`,
    'package.json': JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      type: 'module',
    }),
  },
  assert: async (rig: TestRig) => {
    const filePath = 'packages/core/src/config/scoped-config.ts';
    const content = rig.readFile(filePath);

    if (!content) {
      throw new Error(`File ${filePath} was not created.`);
    }

    // Strip comments to avoid false positives.
    const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    // Ensure that the agent did not use Object.create() in the implementation.
    // We check for the call pattern specifically using a regex to avoid false positives in comments.
    const hasObjectCreate = /\bObject\.create\s*\(/.test(codeWithoutComments);
    if (hasObjectCreate) {
      throw new Error(
        'Evaluation Failed: Agent used Object.create() for cloning. ' +
          'This behavior is forbidden by the project lint rules (no-restricted-syntax). ' +
          'Implementation found:\n\n' +
          content,
      );
    }
  },
});
