/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { ToolManifestLoader } from './ToolManifestLoader.js';
export {
  ToolReferenceResolver,
  resolveToolReferences,
  resolveToolReference,
} from './ToolReferenceResolver.js';

// Dynamic Assembly Engine exports
export { PromptAssembler } from './PromptAssembler.js';
export { ModuleLoaderImpl } from './ModuleLoader.js';
export { ModuleSelectorImpl } from './ModuleSelector.js';
export { ContextDetectorImpl } from './ContextDetector.js';

// Validation System exports
export { ModuleValidator } from './ModuleValidator.js';
export { ValidationSuite } from './ValidationSuite.js';
export { runValidation } from './runValidation.js';

// Self-Review System exports
export { SelfReviewLoop } from './SelfReviewLoop.js';
export {
  SelfReviewIntegration,
  createSelfReviewIntegration,
  shouldIncludeSelfReview,
  getSelfReviewModule,
} from './SelfReviewIntegration.js';

export type {
  ToolManifest,
  ToolDefinition,
  ToolCategory,
  ToolManifestLoaderOptions,
  ToolResolutionResult,
} from './interfaces/tool-manifest.js';

export type {
  PromptModule,
  TaskContext,
  AssemblyResult,
  PromptAssemblerOptions,
  ModuleLoader,
  ModuleSelector,
  ContextDetector,
} from './interfaces/prompt-assembly.js';

export type {
  ModuleValidationResult,
  SystemValidationResult,
  ValidationOptions,
  PerformanceBenchmark,
  QualityTestResult,
} from './ModuleValidator.js';

export type {
  ValidationReport,
} from './ValidationSuite.js';

export type {
  QualityGate,
  QualityCheck,
  ReviewResult,
  ReviewAction,
  QualityGateConfig,
  ReviewContext,
  SelfReviewSystem,
  ReviewModuleInterface,
  ReviewMetrics,
} from './interfaces/self-review.js';
