/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, TestRig } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

describe('file_creation_behavior', () => {
  /**
   * Ensures the agent uses write_file to create a new file when explicitly
   * asked, and places it in the correct location relative to existing
   * project structure.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should create a new file in the correct directory when asked',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'file-creation-test',
          version: '1.0.0',
          type: 'module',
        },
        null,
        2,
      ),
      'src/utils.ts': `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`,
      'src/index.ts': `import { greet } from './utils.js';
console.log(greet('World'));
`,
    },
    prompt:
      'Create a new file src/logger.ts that exports a simple log function which prefixes messages with a timestamp. Do not modify any existing files.',
    assert: async (rig: TestRig) => {
      const logs = rig.readToolLogs();

      // Agent should use write_file to create the new file
      const writeFileCalls = logs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      const loggerWrites = writeFileCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path?.includes('logger.ts');
      });

      expect(
        loggerWrites.length,
        'Agent should have used write_file to create src/logger.ts',
      ).toBeGreaterThanOrEqual(1);

      // Verify the file was actually created
      const loggerPath = path.join(rig.testDir!, 'src', 'logger.ts');
      expect(
        fs.existsSync(loggerPath),
        'src/logger.ts should exist on disk',
      ).toBe(true);

      // Verify the file contains an exported function
      const content = fs.readFileSync(loggerPath, 'utf-8');
      expect(
        content,
        'logger.ts should export a function',
      ).toMatch(/export\s+(function|const)\s+log/);

      // Agent should NOT have modified existing files
      const editCalls = logs.filter(
        (log) =>
          log.toolRequest.name === 'replace' ||
          log.toolRequest.name === 'edit',
      );
      const existingFileEdits = editCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return (
          args.file_path?.includes('utils.ts') ||
          args.file_path?.includes('index.ts')
        );
      });

      expect(
        existingFileEdits.length,
        'Agent should not have modified existing files when told not to',
      ).toBe(0);
    },
  });

  /**
   * Ensures the agent does NOT overwrite an existing file when asked to
   * create a new file with a name that already exists. Instead, it should
   * inform the user or choose a different name.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not overwrite existing file when creating new file with same name',
    files: {
      'config.json': JSON.stringify(
        {
          apiKey: 'existing-key-12345',
          endpoint: 'https://api.example.com',
          timeout: 30000,
        },
        null,
        2,
      ),
      'src/app.ts': `import config from '../config.json';
console.log(config.endpoint);
`,
    },
    prompt:
      'Create a new config.json file with database settings including host, port, and dbname fields.',
    assert: async (rig: TestRig) => {
      const logs = rig.readToolLogs();

      // Read the final config.json content
      const configPath = path.join(rig.testDir!, 'config.json');
      const finalContent = fs.readFileSync(configPath, 'utf-8');

      // The agent should have either:
      // 1. Preserved the existing content and merged/added to it, OR
      // 2. Warned the user about the existing file, OR
      // 3. Created a separate file (e.g., db-config.json)
      //
      // It should NOT have silently destroyed the existing apiKey data
      // without reading it first.
      const readCalls = logs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      const readConfig = readCalls.some((call) =>
        call.toolRequest.args.includes('config.json'),
      );

      const writeFileCalls = logs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      const configWrites = writeFileCalls.filter((call) =>
        call.toolRequest.args.includes('config.json'),
      );

      // If the agent wrote to config.json, it should have read it first
      if (configWrites.length > 0) {
        expect(
          readConfig,
          'Agent should read existing config.json before overwriting it',
        ).toBe(true);
      }

      // Verify the agent produced some output with database settings
      const allWrites = writeFileCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path?.includes('config');
      });
      expect(
        allWrites.length,
        'Agent should have written a config file with database settings',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * Ensures the agent creates multiple files in the correct locations
   * when asked to scaffold a small module with related files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should scaffold multiple related files in correct locations',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'scaffold-test',
          version: '1.0.0',
          type: 'module',
          devDependencies: {
            vitest: '^1.0.0',
            typescript: '^5.0.0',
          },
        },
        null,
        2,
      ),
      'src/index.ts': `// Entry point
console.log('app started');
`,
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            outDir: './dist',
            strict: true,
          },
          include: ['src'],
        },
        null,
        2,
      ),
    },
    prompt:
      'Create a new module at src/auth/ with two files: src/auth/validator.ts that exports a validateToken function, and src/auth/types.ts that exports a Token interface. Do not modify existing files. Do not run any commands.',
    assert: async (rig: TestRig) => {
      const logs = rig.readToolLogs();

      const writeFileCalls = logs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );

      // Check validator.ts was created
      const validatorWrites = writeFileCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path?.includes('auth/validator.ts');
      });
      expect(
        validatorWrites.length,
        'Agent should have created src/auth/validator.ts',
      ).toBeGreaterThanOrEqual(1);

      // Check types.ts was created
      const typesWrites = writeFileCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return args.file_path?.includes('auth/types.ts');
      });
      expect(
        typesWrites.length,
        'Agent should have created src/auth/types.ts',
      ).toBeGreaterThanOrEqual(1);

      // Verify files exist on disk
      const validatorPath = path.join(
        rig.testDir!,
        'src',
        'auth',
        'validator.ts',
      );
      const typesPath = path.join(rig.testDir!, 'src', 'auth', 'types.ts');

      expect(
        fs.existsSync(validatorPath),
        'src/auth/validator.ts should exist on disk',
      ).toBe(true);
      expect(
        fs.existsSync(typesPath),
        'src/auth/types.ts should exist on disk',
      ).toBe(true);

      // Verify content quality
      const validatorContent = fs.readFileSync(validatorPath, 'utf-8');
      const typesContent = fs.readFileSync(typesPath, 'utf-8');

      expect(validatorContent).toMatch(/export/);
      expect(validatorContent).toMatch(/validateToken/);
      expect(typesContent).toMatch(/export/);
      expect(typesContent).toMatch(/interface\s+Token/);

      // Verify no existing files were modified
      const editCalls = logs.filter(
        (log) =>
          log.toolRequest.name === 'replace' ||
          log.toolRequest.name === 'edit',
      );
      const existingFileEdits = editCalls.filter((call) => {
        const args = JSON.parse(call.toolRequest.args);
        return (
          args.file_path?.includes('index.ts') ||
          args.file_path?.includes('package.json')
        );
      });
      expect(
        existingFileEdits.length,
        'Agent should not have modified existing files',
      ).toBe(0);
    },
  });
});
