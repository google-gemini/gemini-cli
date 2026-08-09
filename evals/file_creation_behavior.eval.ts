/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('file_creation_behavior', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should create a new file in the correct directory when asked',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),
      'src/index.ts': 'console.log("hello");',
    },
    prompt:
      'Please create a new file called src/logger.ts containing a simple logging class. Do not modify any existing files.',
    assert: async (rig) => {
      // 1) Verify write_file tool was called
      const logs = rig.readToolLogs();
      const writeFileCalls = logs.filter(
        (log) => log.toolRequest?.name === 'write_file',
      );
      expect(
        writeFileCalls.length,
        'Expected a write_file call to create the new file',
      ).toBeGreaterThanOrEqual(1);

      // 2) Verify existing files were not modified
      const indexContent = rig.readFile('src/index.ts');
      expect(indexContent).toBe('console.log("hello");');

      const pkgContent = rig.readFile('package.json');
      expect(JSON.parse(pkgContent).name).toBe('test-project');

      // 3) Verify new file is created
      const loggerContent = rig.readFile('src/logger.ts');
      expect(loggerContent.length).toBeGreaterThan(0);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should not overwrite existing file when creating new file with same name',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),
      'config.json': JSON.stringify({ port: 3000, env: 'production' }),
    },
    prompt:
      "Please create a new configuration file called config.json in the workspace. Ensure the port is set to 8080. Since there's already a config file there, make sure to check it first before making changes.",
    assert: async (rig) => {
      // Verify that read_file was called on config.json before write_file
      const logs = rig.readToolLogs();
      const targetReadFileIndex = logs.findIndex((log) => {
        if (log.toolRequest?.name !== 'read_file') return false;
        try {
          const args =
            typeof log.toolRequest.args === 'string'
              ? JSON.parse(log.toolRequest.args)
              : log.toolRequest.args;
          return args.file_path === 'config.json';
        } catch {
          return false;
        }
      });

      const targetWriteFileIndex = logs.findIndex((log) => {
        if (log.toolRequest?.name !== 'write_file') return false;
        try {
          const args =
            typeof log.toolRequest.args === 'string'
              ? JSON.parse(log.toolRequest.args)
              : log.toolRequest.args;
          return args.file_path === 'config.json';
        } catch {
          return false;
        }
      });

      expect(
        targetReadFileIndex,
        'Expected read_file to be called to inspect config.json before overwriting it',
      ).toBeGreaterThanOrEqual(0);

      if (targetWriteFileIndex !== -1) {
        expect(
          targetReadFileIndex,
          'Expected read_file to be invoked before write_file for safety',
        ).toBeLessThan(targetWriteFileIndex);
      }

      // Also check the resulting config.json content
      const configContent = rig.readFile('config.json');
      expect(configContent).toContain('8080');
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should scaffold multiple related files in correct locations',
    files: {
      'package.json': JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        type: 'module',
      }),
    },
    prompt:
      'Please scaffold auth validation and types by creating two new files: src/auth/validator.ts and src/auth/types.ts with relevant exports. Do not modify existing files.',
    assert: async (rig) => {
      // Verify files are created in right place
      const validatorContent = rig.readFile('src/auth/validator.ts');
      const typesContent = rig.readFile('src/auth/types.ts');

      expect(validatorContent.length).toBeGreaterThan(0);
      expect(typesContent.length).toBeGreaterThan(0);
    },
  });
});
