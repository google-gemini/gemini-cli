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
 * Onboarding System
 *
 * This module provides onboarding features including the Quick Start Wizard
 * and Onboarding Dashboard for new users.
 *
 * @module onboarding
 */

// Types
export type {
  AuthMethod,
  WizardStep,
  WizardState,
  WizardStepDefinition,
  OnboardingTask,
  TaskCompletion,
  TaskStatus,
  TaskCategory,
  ChecklistState,
  OnboardingStats,
  NextStepRecommendation,
} from './types.js';

// Wizard
export {
  QuickStartWizard,
  WIZARD_STEPS,
  getNextStep,
  getPreviousStep,
  getWizard,
  resetWizard,
} from './wizard.js';

// Checklist
export {
  OnboardingChecklist,
  ONBOARDING_TASKS,
  getChecklist,
  resetChecklist,
} from './checklist.js';
