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
import reviewCodeQuality from './code-understanding/review-code-quality.js';
import identifyDependencies from './code-understanding/identify-dependencies.js';
import traceFunctionCalls from './code-understanding/trace-function-calls.js';

// Development Examples
import writeTests from './development/write-tests.js';
import generateCommits from './development/generate-commits.js';
import refactorCode from './development/refactor-code.js';
import addErrorHandling from './development/add-error-handling.js';
import optimizePerformance from './development/optimize-performance.js';

// File Operations Examples
import renamePhotos from './file-operations/rename-photos.js';
import combineCsvs from './file-operations/combine-csvs.js';
import organizeDownloads from './file-operations/organize-downloads.js';
import deduplicateFiles from './file-operations/deduplicate-files.js';
import batchRename from './file-operations/batch-rename.js';

// Data Analysis Examples
import parseLogs from './data-analysis/parse-logs.js';
import analyzeCsv from './data-analysis/analyze-csv.js';
import extractJson from './data-analysis/extract-json.js';

// Automation Examples
import gitWorkflow from './automation/git-workflow.js';
import setupProject from './automation/setup-project.js';
import runChecks from './automation/run-checks.js';

// Documentation Examples
import generateReadme from './documentation/generate-readme.js';
import generateApiDocs from './documentation/generate-api-docs.js';
import updateChangelog from './documentation/update-changelog.js';

/**
 * All built-in examples
 *
 * Total: 24 examples across 6 categories
 */
export const BUILT_IN_EXAMPLES: Example[] = [
  // Code Understanding (5 examples)
  explainArchitecture,
  findVulnerabilities,
  reviewCodeQuality,
  identifyDependencies,
  traceFunctionCalls,

  // Development (5 examples)
  writeTests,
  generateCommits,
  refactorCode,
  addErrorHandling,
  optimizePerformance,

  // File Operations (5 examples)
  renamePhotos,
  combineCsvs,
  organizeDownloads,
  deduplicateFiles,
  batchRename,

  // Data Analysis (3 examples)
  parseLogs,
  analyzeCsv,
  extractJson,

  // Automation (3 examples)
  gitWorkflow,
  setupProject,
  runChecks,

  // Documentation (3 examples)
  generateReadme,
  generateApiDocs,
  updateChangelog,
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
