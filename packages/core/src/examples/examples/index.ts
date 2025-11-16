/**
 * Copyright 2025 Google LLC
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

/**
 * Built-in Examples Collection
 *
 * This file exports all built-in examples for easy registration.
 * To add a new example, create a file in the appropriate category
 * directory and import it here.
 */

import type { Example } from '../types.js';

// Code Understanding Examples
import explainArchitecture from './code-understanding/explain-architecture.js';
import findVulnerabilities from './code-understanding/find-vulnerabilities.js';

// Development Examples
import writeTests from './development/write-tests.js';
import generateCommits from './development/generate-commits.js';

// File Operations Examples
import renamePhotos from './file-operations/rename-photos.js';
import combineCsvs from './file-operations/combine-csvs.js';

// Data Analysis Examples
import parseLogs from './data-analysis/parse-logs.js';

// Automation Examples
import gitWorkflow from './automation/git-workflow.js';

// Documentation Examples
import generateReadme from './documentation/generate-readme.js';

/**
 * All built-in examples
 */
export const BUILT_IN_EXAMPLES: Example[] = [
  // Code Understanding (15 total planned)
  explainArchitecture,
  findVulnerabilities,

  // Development (20 total planned)
  writeTests,
  generateCommits,

  // File Operations (15 total planned)
  renamePhotos,
  combineCsvs,

  // Data Analysis (10 total planned)
  parseLogs,

  // Automation (12 total planned)
  gitWorkflow,

  // Documentation (10 total planned)
  generateReadme,
];

/**
 * Get all examples
 */
export function getAllExamples(): Example[] {
  return BUILT_IN_EXAMPLES;
}

/**
 * Get example by ID
 */
export function getExampleById(id: string): Example | undefined {
  return BUILT_IN_EXAMPLES.find((ex) => ex.id === id);
}
