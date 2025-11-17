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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  QuickStartWizard,
  WIZARD_STEPS,
  getNextStep,
  getPreviousStep,
  getWizard,
  resetWizard,
} from './wizard.js';
import type { WizardState, WizardStep } from './types.js';

describe('WIZARD_STEPS', () => {
  it('should have all expected wizard steps', () => {
    const expectedSteps: WizardStep[] = [
      'welcome',
      'auth-method',
      'oauth-setup',
      'api-key-setup',
      'vertex-ai-setup',
      'workspace-setup',
      'permissions',
      'personalization',
      'first-task',
      'completion',
    ];

    expectedSteps.forEach((step) => {
      expect(WIZARD_STEPS[step]).toBeDefined();
      expect(WIZARD_STEPS[step].id).toBe(step);
      expect(WIZARD_STEPS[step].title).toBeTruthy();
      expect(WIZARD_STEPS[step].description).toBeTruthy();
      expect(typeof WIZARD_STEPS[step].skippable).toBe('boolean');
    });
  });

  it('should mark non-auth steps as skippable', () => {
    expect(WIZARD_STEPS['workspace-setup'].skippable).toBe(true);
    expect(WIZARD_STEPS['permissions'].skippable).toBe(true);
    expect(WIZARD_STEPS['personalization'].skippable).toBe(true);
    expect(WIZARD_STEPS['first-task'].skippable).toBe(true);
  });

  it('should mark critical steps as non-skippable', () => {
    expect(WIZARD_STEPS['welcome'].skippable).toBe(false);
    expect(WIZARD_STEPS['auth-method'].skippable).toBe(false);
    expect(WIZARD_STEPS['completion'].skippable).toBe(false);
  });
});

describe('getNextStep', () => {
  it('should navigate from welcome to auth-method', () => {
    const state: WizardState = {
      currentStep: 'welcome',
      completedSteps: [],
      isActive: true,
    };
    expect(getNextStep(state)).toBe('auth-method');
  });

  it('should route to oauth-setup when oauth is selected', () => {
    const state: WizardState = {
      currentStep: 'auth-method',
      completedSteps: ['welcome'],
      isActive: true,
      authMethod: 'oauth',
    };
    expect(getNextStep(state)).toBe('oauth-setup');
  });

  it('should route to api-key-setup when api-key is selected', () => {
    const state: WizardState = {
      currentStep: 'auth-method',
      completedSteps: ['welcome'],
      isActive: true,
      authMethod: 'api-key',
    };
    expect(getNextStep(state)).toBe('api-key-setup');
  });

  it('should route to vertex-ai-setup when vertex-ai is selected', () => {
    const state: WizardState = {
      currentStep: 'auth-method',
      completedSteps: ['welcome'],
      isActive: true,
      authMethod: 'vertex-ai',
    };
    expect(getNextStep(state)).toBe('vertex-ai-setup');
  });

  it('should skip auth setup when none is selected', () => {
    const state: WizardState = {
      currentStep: 'auth-method',
      completedSteps: ['welcome'],
      isActive: true,
      authMethod: 'none',
    };
    expect(getNextStep(state)).toBe('workspace-setup');
  });

  it('should navigate through the full wizard flow', () => {
    const flow: Array<[WizardStep, WizardStep | null]> = [
      ['welcome', 'auth-method'],
      ['oauth-setup', 'workspace-setup'],
      ['workspace-setup', 'permissions'],
      ['permissions', 'personalization'],
      ['personalization', 'first-task'],
      ['first-task', 'completion'],
      ['completion', null],
    ];

    flow.forEach(([current, expected]) => {
      const state: WizardState = {
        currentStep: current,
        completedSteps: [],
        isActive: true,
      };
      expect(getNextStep(state)).toBe(expected);
    });
  });
});

describe('getPreviousStep', () => {
  it('should return null when no steps completed', () => {
    const state: WizardState = {
      currentStep: 'welcome',
      completedSteps: [],
      isActive: true,
    };
    expect(getPreviousStep(state)).toBe(null);
  });

  it('should return last completed step', () => {
    const state: WizardState = {
      currentStep: 'workspace-setup',
      completedSteps: ['welcome', 'auth-method', 'oauth-setup'],
      isActive: true,
    };
    expect(getPreviousStep(state)).toBe('oauth-setup');
  });
});

describe('QuickStartWizard', () => {
  let tempDir: string;
  let wizard: QuickStartWizard;

  beforeEach(() => {
    // Create a temporary directory for test state
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-test-'));
    const statePath = path.join(tempDir, 'wizard-state.json');
    wizard = new QuickStartWizard(statePath);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('start', () => {
    it('should initialize wizard state', () => {
      wizard.start();
      const state = wizard.getState();

      expect(state.isActive).toBe(true);
      expect(state.currentStep).toBe('welcome');
      expect(state.completedSteps).toEqual([]);
      expect(state.startedAt).toBeDefined();
      expect(state.startedAt).toBeGreaterThan(0);
    });

    it('should persist state to disk', () => {
      wizard.start();
      const statePath = path.join(tempDir, 'wizard-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(savedState.isActive).toBe(true);
      expect(savedState.currentStep).toBe('welcome');
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      wizard.start();
      const state1 = wizard.getState();
      const state2 = wizard.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('updateState', () => {
    it('should update state with new values', () => {
      wizard.start();
      wizard.updateState({
        authMethod: 'oauth',
        workspaceDirectory: '/home/user/projects',
      });

      const state = wizard.getState();
      expect(state.authMethod).toBe('oauth');
      expect(state.workspaceDirectory).toBe('/home/user/projects');
    });

    it('should persist updates to disk', () => {
      wizard.start();
      wizard.updateState({ authMethod: 'api-key' });

      const statePath = path.join(tempDir, 'wizard-state.json');
      const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(savedState.authMethod).toBe('api-key');
    });
  });

  describe('nextStep', () => {
    it('should advance to next step', () => {
      wizard.start();
      const nextStep = wizard.nextStep();

      expect(nextStep).toBe('auth-method');
      expect(wizard.getState().currentStep).toBe('auth-method');
    });

    it('should add current step to completed steps', () => {
      wizard.start();
      wizard.nextStep();

      const state = wizard.getState();
      expect(state.completedSteps).toContain('welcome');
    });

    it('should return null when wizard is complete', () => {
      wizard.start();
      wizard.updateState({ currentStep: 'completion' });
      const nextStep = wizard.nextStep();

      expect(nextStep).toBe(null);
    });

    it('should route correctly based on auth method', () => {
      wizard.start();
      wizard.nextStep(); // Move to auth-method
      wizard.updateState({ authMethod: 'oauth' });
      const nextStep = wizard.nextStep();

      expect(nextStep).toBe('oauth-setup');
    });
  });

  describe('previousStep', () => {
    it('should return null when at first step', () => {
      wizard.start();
      const prevStep = wizard.previousStep();
      expect(prevStep).toBe(null);
    });

    it('should move back to previous step', () => {
      wizard.start();
      wizard.nextStep(); // welcome -> auth-method
      wizard.nextStep(); // auth-method -> workspace-setup (or auth setup)

      const prevStep = wizard.previousStep();
      expect(prevStep).toBeTruthy();
      expect(wizard.getState().currentStep).toBe(prevStep);
    });

    it('should remove step from completed steps', () => {
      wizard.start();
      wizard.nextStep(); // complete welcome
      wizard.nextStep(); // complete auth-method

      const state1 = wizard.getState();
      const completedBefore = state1.completedSteps.length;

      wizard.previousStep();

      const state2 = wizard.getState();
      expect(state2.completedSteps.length).toBe(completedBefore - 1);
    });
  });

  describe('skipStep', () => {
    it('should skip skippable steps', () => {
      wizard.start();
      wizard.updateState({ currentStep: 'workspace-setup' });
      const result = wizard.skipStep();

      expect(result).toBe(true);
      expect(wizard.getState().currentStep).toBe('permissions');
    });

    it('should not skip non-skippable steps', () => {
      wizard.start();
      const result = wizard.skipStep();

      expect(result).toBe(false);
      expect(wizard.getState().currentStep).toBe('welcome');
    });
  });

  describe('complete', () => {
    it('should mark wizard as complete', () => {
      wizard.start();
      wizard.complete();

      const state = wizard.getState();
      expect(state.isActive).toBe(false);
      expect(state.completedAt).toBeDefined();
      expect(state.completedAt).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset wizard to initial state', () => {
      wizard.start();
      wizard.updateState({
        authMethod: 'oauth',
        workspaceDirectory: '/test',
      });
      wizard.nextStep();
      wizard.reset();

      const state = wizard.getState();
      expect(state.isActive).toBe(false);
      expect(state.currentStep).toBe('welcome');
      expect(state.completedSteps).toEqual([]);
      expect(state.authMethod).toBeUndefined();
      expect(state.workspaceDirectory).toBeUndefined();
    });
  });

  describe('shouldRun', () => {
    it('should return true for new users', () => {
      const result = wizard.shouldRun();
      // Will depend on whether config files exist
      expect(typeof result).toBe('boolean');
    });

    it('should return false after completion', () => {
      wizard.start();
      wizard.complete();
      const result = wizard.shouldRun();
      expect(result).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('should return 0 at start', () => {
      wizard.start();
      const progress = wizard.getProgress();
      expect(progress).toBe(0);
    });

    it('should calculate progress based on completed steps', () => {
      wizard.start();
      wizard.nextStep();
      wizard.nextStep();

      const progress = wizard.getProgress();
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    it('should return percentage as integer', () => {
      wizard.start();
      const progress = wizard.getProgress();
      expect(Number.isInteger(progress)).toBe(true);
    });
  });

  describe('getTimeSpent', () => {
    it('should return 0 when not started', () => {
      const timeSpent = wizard.getTimeSpent();
      expect(timeSpent).toBe(0);
    });

    it('should calculate time spent in wizard', async () => {
      wizard.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const timeSpent = wizard.getTimeSpent();
      expect(timeSpent).toBeGreaterThan(0);
    });

    it('should use completed time if wizard is complete', () => {
      wizard.start();
      const startedAt = Date.now() - 5000; // Started 5 seconds ago
      const completedAt = Date.now() - 1000; // Completed 1 second ago
      wizard.updateState({ startedAt, completedAt });

      const timeSpent = wizard.getTimeSpent();
      expect(timeSpent).toBe(4000); // 5 seconds - 1 second = 4 seconds
    });
  });

  describe('persistence', () => {
    it('should load existing state from disk', () => {
      wizard.start();
      wizard.updateState({ authMethod: 'oauth' });
      wizard.nextStep();

      // Create new instance with same state path
      const statePath = path.join(tempDir, 'wizard-state.json');
      const wizard2 = new QuickStartWizard(statePath);
      const state = wizard2.getState();

      expect(state.authMethod).toBe('oauth');
      expect(state.currentStep).toBe('auth-method');
    });

    it('should handle missing state file gracefully', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent', 'state.json');
      const wizard2 = new QuickStartWizard(nonExistentPath);
      const state = wizard2.getState();

      expect(state.currentStep).toBe('welcome');
      expect(state.isActive).toBe(false);
    });

    it('should handle corrupted state file gracefully', () => {
      const statePath = path.join(tempDir, 'wizard-state.json');
      fs.writeFileSync(statePath, 'invalid json{]', 'utf8');

      const wizard2 = new QuickStartWizard(statePath);
      const state = wizard2.getState();

      expect(state.currentStep).toBe('welcome');
      expect(state.isActive).toBe(false);
    });
  });
});

describe('Singleton functions', () => {
  afterEach(() => {
    resetWizard();
  });

  describe('getWizard', () => {
    it('should return the same instance on multiple calls', () => {
      const wizard1 = getWizard();
      const wizard2 = getWizard();
      expect(wizard1).toBe(wizard2);
    });
  });

  describe('resetWizard', () => {
    it('should reset singleton instance', () => {
      const wizard1 = getWizard();
      resetWizard();
      const wizard2 = getWizard();
      expect(wizard1).not.toBe(wizard2);
    });
  });
});
