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
 * Explain Mode Module
 *
 * Tool usage transparency and educational annotations
 *
 * @module explain
 */

// Types
export type {
  VerbosityLevel,
  ExplainConfig,
  ToolExplanation,
  ExplanationTemplate,
  ExplanationExample,
  ReasoningStep,
  OperationExplanation,
  EducationalTip,
  TipCategory,
  TipTrigger,
  ExplainStats,
} from './types.js';

// Explain Mode Manager
export {
  ExplainMode,
  getExplainMode,
  resetExplainMode,
} from './explain-mode.js';

// Templates
export { EXPLANATION_TEMPLATES } from './templates.js';
