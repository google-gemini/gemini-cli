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
 * Onboarding System Types
 *
 * This module defines all types for the Onboarding features, including
 * the Quick Start Wizard and Onboarding Dashboard.
 *
 * @module onboarding/types
 */

/**
 * Authentication method type
 */
export type AuthMethod = 'oauth' | 'api-key' | 'vertex-ai' | 'none';

/**
 * Wizard step identifier
 */
export type WizardStep =
  | 'welcome'
  | 'auth-method'
  | 'oauth-setup'
  | 'api-key-setup'
  | 'vertex-ai-setup'
  | 'workspace-setup'
  | 'permissions'
  | 'personalization'
  | 'first-task'
  | 'completion';

/**
 * Wizard state
 */
export interface WizardState {
  /** Current step */
  currentStep: WizardStep;

  /** Completed steps */
  completedSteps: WizardStep[];

  /** Whether wizard is active */
  isActive: boolean;

  /** Selected authentication method */
  authMethod?: AuthMethod;

  /** Workspace directory */
  workspaceDirectory?: string;

  /** Trust level */
  trustLevel?: 'low' | 'medium' | 'high';

  /** User's primary use case */
  useCase?: string;

  /** Selected features to enable */
  enabledFeatures?: string[];

  /** Wizard start time */
  startedAt?: number;

  /** Wizard completion time */
  completedAt?: number;

  /** Error state if any */
  error?: string;
}

/**
 * Wizard step definition
 */
export interface WizardStepDefinition {
  /** Step identifier */
  id: WizardStep;

  /** Display title */
  title: string;

  /** Description */
  description: string;

  /** Whether step can be skipped */
  skippable: boolean;

  /** Validation function */
  validate?: (state: WizardState) => Promise<boolean>;

  /** Action to perform */
  action?: (state: WizardState) => Promise<Partial<WizardState>>;
}

/**
 * Onboarding task category
 */
export type TaskCategory = 'essential' | 'core' | 'advanced';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

/**
 * Onboarding task definition
 */
export interface OnboardingTask {
  /** Unique task identifier */
  id: string;

  /** Display title */
  title: string;

  /** Description */
  description: string;

  /** Category */
  category: TaskCategory;

  /** Estimated time to complete */
  estimatedTime: string;

  /** Command to run (if applicable) */
  command?: string;

  /** How to verify completion */
  verificationMethod: 'manual' | 'automatic';

  /** Auto-detection function */
  autoDetect?: () => Promise<boolean>;

  /** Help text */
  helpText?: string;

  /** Documentation link */
  docLink?: string;

  /** Prerequisites (task IDs that must be completed first) */
  prerequisites?: string[];
}

/**
 * Task completion record
 */
export interface TaskCompletion {
  /** Task ID */
  taskId: string;

  /** Current status */
  status: TaskStatus;

  /** When task was started */
  startedAt?: number;

  /** When task was completed */
  completedAt?: number;

  /** User notes */
  notes?: string;
}

/**
 * Onboarding checklist state
 */
export interface ChecklistState {
  /** All task completions */
  tasks: Record<string, TaskCompletion>;

  /** Overall progress percentage (0-100) */
  progress: number;

  /** When checklist was started */
  startedAt: number;

  /** When checklist was last updated */
  lastUpdatedAt: number;

  /** Whether user has completed onboarding */
  isComplete: boolean;
}

/**
 * Onboarding statistics
 */
export interface OnboardingStats {
  /** Total tasks */
  totalTasks: number;

  /** Completed tasks */
  completedTasks: number;

  /** Tasks by category */
  byCategory: Record<TaskCategory, { total: number; completed: number }>;

  /** Average completion time */
  averageCompletionTime?: number;

  /** Time to first completed task */
  timeToFirstTask?: number;

  /** Completion rate */
  completionRate: number;
}

/**
 * Next step recommendation
 */
export interface NextStepRecommendation {
  /** Recommended task */
  task: OnboardingTask;

  /** Reason for recommendation */
  reason: string;

  /** Priority (1-5, higher is more important) */
  priority: number;
}
