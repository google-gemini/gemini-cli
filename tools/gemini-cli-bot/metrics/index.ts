/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const SCRIPTS_DIR = join(
  process.cwd(),
  'tools',
  'gemini-cli-bot',
  'metrics',
  'scripts',
);
const OUTPUT_FILE = join(process.cwd(), 'metrics-before.csv');

async function run() {
  const scripts = readdirSync(SCRIPTS_DIR).filter(
    (file) => file.endsWith('.ts') || file.endsWith('.js'),
  );

  const results: string[] = ['metric,value'];

  for (const script of scripts) {
    console.log(`Running metric script: ${script}`);
    try {
      const scriptPath = join(SCRIPTS_DIR, script);
      const output = execSync(`npx tsx ${scriptPath}`, {
        encoding: 'utf-8',
      });
      results.push(output.trim());
    } catch (error) {
      console.error(`Error running ${script}:`, error);
    }
  }

  writeFileSync(OUTPUT_FILE, results.join('\n'));
  console.log(`Saved metrics to ${OUTPUT_FILE}`);
}

run().catch(console.error);
