/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sanitizeTestName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
}

export class TestRig {
  constructor() {
    this.bundlePath = join(__dirname, '..', 'bundle/gemini.js');
    this.testDir = null;
  }

  setup(testName) {
    this.testName = testName;
    const sanitizedName = sanitizeTestName(testName);
    this.testDir = join(env.INTEGRATION_TEST_FILE_DIR, sanitizedName);
    mkdirSync(this.testDir, { recursive: true });
  }

  createFile(fileName, content) {
    const filePath = join(this.testDir, fileName);
    writeFileSync(filePath, content);
    return filePath;
  }

  mkdir(dir) {
    mkdirSync(join(this.testDir, dir));
  }

  sync() {
    // ensure file system is done before spawning
    execSync('sync', { cwd: this.testDir });
  }

  run(prompt, ...args) {
    const cmdArgs = [
      this.bundlePath,
      '--yolo',
      '--prompt',
      prompt,
      ...args,
    ];
    const output = execFileSync(
      'node',
      cmdArgs,
      {
        cwd: this.testDir,
        encoding: 'utf-8',
      },
    );

    if (env.KEEP_OUTPUT === 'true') {
      const testId = `${env.TEST_FILE_NAME.replace(
        '.test.js',
        '',
      )}:${this.testName.replace(/ /g, '-')}`;
      console.log(`--- TEST: ${testId} ---`);
      console.log(output);
      console.log(`--- END TEST: ${testId} ---`);
    }

    return output;
  }

  readFile(fileName) {
    const content = readFileSync(join(this.testDir, fileName), 'utf-8');
    if (env.KEEP_OUTPUT === 'true') {
      const testId = `${env.TEST_FILE_NAME.replace(
        '.test.js',
        '',
      )}:${this.testName.replace(/ /g, '-')}`;
      console.log(`--- FILE: ${testId}/${fileName} ---`);
      console.log(content);
      console.log(`--- END FILE: ${testId}/${fileName} ---`);
    }
    return content;
  }
}
