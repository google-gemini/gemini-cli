/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Scenario registry that collects all evaluation scenarios
 * from each category subdirectory.
 */

import type { EvalScenario } from '../types.js';

// Debugging scenarios
import { fixNullPointer } from './debugging/fixNullPointer.js';
import { fixOffByOne } from './debugging/fixOffByOne.js';
import { fixAsyncAwait } from './debugging/fixAsyncAwait.js';
import { fixTypeError } from './debugging/fixTypeError.js';
import { fixMemoryLeak } from './debugging/fixMemoryLeak.js';
import { fixRaceCondition } from './debugging/fixRaceCondition.js';
import { fixImportError } from './debugging/fixImportError.js';
import { fixRegex } from './debugging/fixRegex.js';
import { fixInfiniteLoop } from './debugging/fixInfiniteLoop.js';
import { fixScopeIssue } from './debugging/fixScopeIssue.js';
import { fixClosureCapture } from './debugging/fixClosureCapture.js';

// Refactoring scenarios
import { extractFunction } from './refactoring/extractFunction.js';
import { renameVariable } from './refactoring/renameVariable.js';
import { simplifyConditionals } from './refactoring/simplifyConditionals.js';
import { removeDeadCode } from './refactoring/removeDeadCode.js';
import { convertCallback } from './refactoring/convertCallback.js';
import { extractInterface } from './refactoring/extractInterface.js';
import { inlineVariable } from './refactoring/inlineVariable.js';
import { splitClass } from './refactoring/splitClass.js';
import { deduplicateCode } from './refactoring/deduplicateCode.js';
import { modernizeSyntax } from './refactoring/modernizeSyntax.js';
import { replaceSwitch } from './refactoring/replaceSwitch.js';

// New features scenarios
import { addCliFlag } from './new-features/addCliFlag.js';
import { addValidation } from './new-features/addValidation.js';
import { addLogging } from './new-features/addLogging.js';
import { addRetry } from './new-features/addRetry.js';
import { addCache } from './new-features/addCache.js';
import { addPagination } from './new-features/addPagination.js';
import { addFilter } from './new-features/addFilter.js';
import { addSort } from './new-features/addSort.js';
import { addExport } from './new-features/addExport.js';
import { addConfig } from './new-features/addConfig.js';
import { addRateLimit } from './new-features/addRateLimit.js';
import { addMiddleware } from './new-features/addMiddleware.js';

// Code review scenarios
import { spotXss } from './code-review/spotXss.js';
import { findSqlInjection } from './code-review/findSqlInjection.js';
import { identifyNPlusOne } from './code-review/identifyNPlusOne.js';
import { findHardcoded } from './code-review/findHardcoded.js';
import { spotRaceCondition } from './code-review/spotRaceCondition.js';
import { findMemoryLeak } from './code-review/findMemoryLeak.js';
import { identifyCodeSmell } from './code-review/identifyCodeSmell.js';
import { checkErrorHandling } from './code-review/checkErrorHandling.js';
import { reviewTypes } from './code-review/reviewTypes.js';
import { checkAccessControl } from './code-review/checkAccessControl.js';
import { reviewErrorMessages } from './code-review/reviewErrorMessages.js';

// Documentation scenarios
import { generateJsdoc } from './documentation/generateJsdoc.js';
import { fixOutdatedDocs } from './documentation/fixOutdatedDocs.js';
import { addExamples } from './documentation/addExamples.js';
import { writeReadme } from './documentation/writeReadme.js';
import { documentApi } from './documentation/documentApi.js';
import { addTypeDocumentation } from './documentation/addTypeDocumentation.js';

/** All debugging evaluation scenarios. */
export const debuggingScenarios: EvalScenario[] = [
  fixNullPointer,
  fixOffByOne,
  fixAsyncAwait,
  fixTypeError,
  fixMemoryLeak,
  fixRaceCondition,
  fixImportError,
  fixRegex,
  fixInfiniteLoop,
  fixScopeIssue,
  fixClosureCapture,
];

/** All refactoring evaluation scenarios. */
export const refactoringScenarios: EvalScenario[] = [
  extractFunction,
  renameVariable,
  simplifyConditionals,
  removeDeadCode,
  convertCallback,
  extractInterface,
  inlineVariable,
  splitClass,
  deduplicateCode,
  modernizeSyntax,
  replaceSwitch,
];

/** All new-features evaluation scenarios. */
export const newFeaturesScenarios: EvalScenario[] = [
  addCliFlag,
  addValidation,
  addLogging,
  addRetry,
  addCache,
  addPagination,
  addFilter,
  addSort,
  addExport,
  addConfig,
  addRateLimit,
  addMiddleware,
];

/** All code-review evaluation scenarios. */
export const codeReviewScenarios: EvalScenario[] = [
  spotXss,
  findSqlInjection,
  identifyNPlusOne,
  findHardcoded,
  spotRaceCondition,
  findMemoryLeak,
  identifyCodeSmell,
  checkErrorHandling,
  reviewTypes,
  checkAccessControl,
  reviewErrorMessages,
];

/** All documentation evaluation scenarios. */
export const documentationScenarios: EvalScenario[] = [
  generateJsdoc,
  fixOutdatedDocs,
  addExamples,
  writeReadme,
  documentApi,
  addTypeDocumentation,
];

/** Complete registry of all evaluation scenarios across all categories. */
export const allScenarios: EvalScenario[] = [
  ...debuggingScenarios,
  ...refactoringScenarios,
  ...newFeaturesScenarios,
  ...codeReviewScenarios,
  ...documentationScenarios,
];

/**
 * Retrieves scenarios filtered by category.
 *
 * @param category The category to filter by.
 * @returns Scenarios matching the given category.
 */
export function getScenariosByCategory(
  category: EvalScenario['category'],
): EvalScenario[] {
  return allScenarios.filter((s) => s.category === category);
}

/**
 * Retrieves scenarios filtered by difficulty.
 *
 * @param difficulty The difficulty level to filter by.
 * @returns Scenarios matching the given difficulty.
 */
export function getScenariosByDifficulty(
  difficulty: EvalScenario['difficulty'],
): EvalScenario[] {
  return allScenarios.filter((s) => s.difficulty === difficulty);
}

/**
 * Retrieves scenarios filtered by tag.
 *
 * @param tag The tag to filter by.
 * @returns Scenarios that include the given tag.
 */
export function getScenariosByTag(tag: string): EvalScenario[] {
  return allScenarios.filter((s) => s.tags?.includes(tag));
}

/**
 * Looks up a single scenario by its unique id.
 *
 * @param id The scenario id.
 * @returns The matching scenario, or undefined.
 */
export function getScenarioById(id: string): EvalScenario | undefined {
  return allScenarios.find((s) => s.id === id);
}
