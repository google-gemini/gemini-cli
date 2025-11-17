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
 * Quick Start Wizard
 *
 * Manages the onboarding wizard flow including authentication setup,
 * workspace configuration, and personalization.
 *
 * @module onboarding/wizard
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  WizardState,
  WizardStep,
  WizardStepDefinition,
  AuthMethod,
} from './types.js';

/**
 * Get the wizard state file path
 */
function getWizardStatePath(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.gemini-cli');
  return path.join(configDir, 'wizard-state.json');
}

/**
 * Default wizard state
 */
const defaultState: WizardState = {
  currentStep: 'welcome',
  completedSteps: [],
  isActive: false,
};

/**
 * Wizard step definitions
 */
export const WIZARD_STEPS: Record<WizardStep, WizardStepDefinition> = {
  welcome: {
    id: 'welcome',
    title: 'Welcome to Gemini CLI',
    description: 'Get started with Gemini CLI in just a few minutes',
    skippable: false,
  },
  'auth-method': {
    id: 'auth-method',
    title: 'Choose Authentication Method',
    description: 'Select how you want to authenticate with Gemini',
    skippable: false,
  },
  'oauth-setup': {
    id: 'oauth-setup',
    title: 'OAuth Setup',
    description: 'Authenticate with your Google account',
    skippable: false,
  },
  'api-key-setup': {
    id: 'api-key-setup',
    title: 'API Key Setup',
    description: 'Configure your Gemini API key',
    skippable: false,
  },
  'vertex-ai-setup': {
    id: 'vertex-ai-setup',
    title: 'Vertex AI Setup',
    description: 'Configure Vertex AI credentials',
    skippable: false,
  },
  'workspace-setup': {
    id: 'workspace-setup',
    title: 'Workspace Setup',
    description: 'Select your working directory',
    skippable: true,
  },
  permissions: {
    id: 'permissions',
    title: 'Permission Settings',
    description: 'Configure file access and trust levels',
    skippable: true,
  },
  personalization: {
    id: 'personalization',
    title: 'Personalize Your Experience',
    description: 'Tell us how you plan to use Gemini CLI',
    skippable: true,
  },
  'first-task': {
    id: 'first-task',
    title: 'Try Your First Task',
    description: 'Run a simple example to get started',
    skippable: true,
  },
  completion: {
    id: 'completion',
    title: 'All Set!',
    description: "You're ready to use Gemini CLI",
    skippable: false,
  },
};

/**
 * Wizard flow - defines step order based on choices
 */
export function getNextStep(state: WizardState): WizardStep | null {
  const current = state.currentStep;

  switch (current) {
    case 'welcome':
      return 'auth-method';

    case 'auth-method':
      // Route to appropriate auth setup based on selection
      if (state.authMethod === 'oauth') return 'oauth-setup';
      if (state.authMethod === 'api-key') return 'api-key-setup';
      if (state.authMethod === 'vertex-ai') return 'vertex-ai-setup';
      return 'workspace-setup'; // Skip auth if none selected

    case 'oauth-setup':
    case 'api-key-setup':
    case 'vertex-ai-setup':
      return 'workspace-setup';

    case 'workspace-setup':
      return 'permissions';

    case 'permissions':
      return 'personalization';

    case 'personalization':
      return 'first-task';

    case 'first-task':
      return 'completion';

    case 'completion':
      return null; // Wizard complete

    default:
      return null;
  }
}

/**
 * Get previous step
 */
export function getPreviousStep(state: WizardState): WizardStep | null {
  if (state.completedSteps.length === 0) return null;
  return state.completedSteps[state.completedSteps.length - 1];
}

/**
 * Quick Start Wizard Manager
 */
export class QuickStartWizard {
  private state: WizardState;
  private statePath: string;

  constructor(statePath?: string) {
    this.statePath = statePath || getWizardStatePath();
    this.state = this.load();
  }

  /**
   * Start the wizard
   */
  start(): void {
    this.state = {
      ...defaultState,
      isActive: true,
      startedAt: Date.now(),
    };
    this.save();
  }

  /**
   * Get current state
   */
  getState(): WizardState {
    return { ...this.state };
  }

  /**
   * Update state
   */
  updateState(updates: Partial<WizardState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };
    this.save();
  }

  /**
   * Move to next step
   */
  nextStep(): WizardStep | null {
    const next = getNextStep(this.state);
    if (next) {
      this.state.completedSteps.push(this.state.currentStep);
      this.state.currentStep = next;
      this.save();
    }
    return next;
  }

  /**
   * Move to previous step
   */
  previousStep(): WizardStep | null {
    const previous = getPreviousStep(this.state);
    if (previous) {
      this.state.completedSteps.pop();
      this.state.currentStep = previous;
      this.save();
    }
    return previous;
  }

  /**
   * Skip current step
   */
  skipStep(): boolean {
    const stepDef = WIZARD_STEPS[this.state.currentStep];
    if (!stepDef.skippable) return false;

    const next = this.nextStep();
    return next !== null;
  }

  /**
   * Complete the wizard
   */
  complete(): void {
    this.state.isActive = false;
    this.state.completedAt = Date.now();
    this.save();
  }

  /**
   * Reset the wizard
   */
  reset(): void {
    this.state = { ...defaultState };
    this.save();
  }

  /**
   * Check if wizard should run (first-time user)
   */
  shouldRun(): boolean {
    return !this.state.completedAt && !this.hasExistingConfig();
  }

  /**
   * Check if user has existing configuration
   */
  private hasExistingConfig(): boolean {
    // Check for existing auth config
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, '.gemini-cli');

    // Check for various config files that indicate setup
    const configFiles = [
      path.join(configDir, 'config.json'),
      path.join(configDir, 'auth.json'),
      path.join(configDir, '.gemini-auth'),
    ];

    return configFiles.some((file) => fs.existsSync(file));
  }

  /**
   * Save state to disk
   */
  private save(): void {
    try {
      const dirPath = path.dirname(this.statePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(
        this.statePath,
        JSON.stringify(this.state, null, 2),
        'utf8',
      );
    } catch (error) {
      console.error('Failed to save wizard state:', error);
    }
  }

  /**
   * Load state from disk
   */
  private load(): WizardState {
    try {
      if (fs.existsSync(this.statePath)) {
        const json = fs.readFileSync(this.statePath, 'utf8');
        return JSON.parse(json);
      }
    } catch (error) {
      console.error('Failed to load wizard state:', error);
    }
    return { ...defaultState };
  }

  /**
   * Get completion progress (0-100)
   */
  getProgress(): number {
    const totalSteps = Object.keys(WIZARD_STEPS).length;
    const completed = this.state.completedSteps.length;
    return Math.round((completed / totalSteps) * 100);
  }

  /**
   * Get time spent in wizard (milliseconds)
   */
  getTimeSpent(): number {
    if (!this.state.startedAt) return 0;
    const endTime = this.state.completedAt || Date.now();
    return endTime - this.state.startedAt;
  }
}

/**
 * Singleton instance
 */
let wizardInstance: QuickStartWizard | null = null;

/**
 * Get the global wizard instance
 */
export function getWizard(): QuickStartWizard {
  if (!wizardInstance) {
    wizardInstance = new QuickStartWizard();
  }
  return wizardInstance;
}

/**
 * Reset the global wizard instance (mainly for testing)
 */
export function resetWizard(): void {
  wizardInstance = null;
}
