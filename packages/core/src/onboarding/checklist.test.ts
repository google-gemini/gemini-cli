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
  OnboardingChecklist,
  ONBOARDING_TASKS,
  getChecklist,
  resetChecklist,
} from './checklist.js';
import type { TaskCategory } from './types.js';

describe('ONBOARDING_TASKS', () => {
  it('should have 20 tasks', () => {
    expect(ONBOARDING_TASKS).toHaveLength(20);
  });

  it('should have 6 essential tasks', () => {
    const essential = ONBOARDING_TASKS.filter(
      (t) => t.category === 'essential',
    );
    expect(essential).toHaveLength(6);
  });

  it('should have 8 core tasks', () => {
    const core = ONBOARDING_TASKS.filter((t) => t.category === 'core');
    expect(core).toHaveLength(8);
  });

  it('should have 6 advanced tasks', () => {
    const advanced = ONBOARDING_TASKS.filter((t) => t.category === 'advanced');
    expect(advanced).toHaveLength(6);
  });

  it('should have unique task IDs', () => {
    const ids = ONBOARDING_TASKS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ONBOARDING_TASKS.length);
  });

  it('should have all required fields', () => {
    ONBOARDING_TASKS.forEach((task) => {
      expect(task.id).toBeTruthy();
      expect(task.title).toBeTruthy();
      expect(task.description).toBeTruthy();
      expect(task.category).toBeTruthy();
      expect(task.estimatedTime).toBeTruthy();
      expect(['manual', 'automatic']).toContain(task.verificationMethod);
    });
  });

  it('should have valid prerequisite references', () => {
    const allIds = new Set(ONBOARDING_TASKS.map((t) => t.id));

    ONBOARDING_TASKS.forEach((task) => {
      if (task.prerequisites) {
        task.prerequisites.forEach((prereqId) => {
          expect(allIds.has(prereqId)).toBe(true);
        });
      }
    });
  });

  it('should not have circular dependencies', () => {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (taskId: string): boolean => {
      if (!visited.has(taskId)) {
        visited.add(taskId);
        recursionStack.add(taskId);

        const task = ONBOARDING_TASKS.find((t) => t.id === taskId);
        if (task?.prerequisites) {
          for (const prereqId of task.prerequisites) {
            if (!visited.has(prereqId) && hasCycle(prereqId)) {
              return true;
            } else if (recursionStack.has(prereqId)) {
              return true;
            }
          }
        }
      }
      recursionStack.delete(taskId);
      return false;
    };

    ONBOARDING_TASKS.forEach((task) => {
      expect(hasCycle(task.id)).toBe(false);
    });
  });
});

describe('OnboardingChecklist', () => {
  let tempDir: string;
  let checklist: OnboardingChecklist;

  /**
   * Helper to complete all tasks in dependency order
   */
  const completeAllTasksInOrder = (checklistInstance: OnboardingChecklist) => {
    const completed = new Set<string>();
    const tasksArray = ONBOARDING_TASKS;

    // Keep trying to complete tasks until all are done
    while (completed.size < tasksArray.length) {
      let progress = false;

      for (const task of tasksArray) {
        if (completed.has(task.id)) continue;

        // Check if all prerequisites are met
        const prerequisitesMet =
          !task.prerequisites ||
          task.prerequisites.every((prereqId) => completed.has(prereqId));

        if (prerequisitesMet) {
          checklistInstance.completeTask(task.id);
          completed.add(task.id);
          progress = true;
        }
      }

      // Prevent infinite loop
      if (!progress) {
        throw new Error('Cannot complete all tasks - circular dependencies?');
      }
    }
  };

  beforeEach(() => {
    // Create a temporary directory for test state
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-test-'));
    const statePath = path.join(tempDir, 'checklist-state.json');
    checklist = new OnboardingChecklist(statePath);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = checklist.getState();

      expect(state.tasks).toBeDefined();
      expect(state.progress).toBe(0);
      expect(state.isComplete).toBe(false);
      expect(state.startedAt).toBeGreaterThan(0);
      expect(state.lastUpdatedAt).toBeGreaterThan(0);
    });

    it('should return a copy of state', () => {
      const state1 = checklist.getState();
      const state2 = checklist.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('getAllTasks', () => {
    it('should return all tasks', () => {
      const tasks = checklist.getAllTasks();
      expect(tasks).toHaveLength(ONBOARDING_TASKS.length);
    });

    it('should return task objects', () => {
      const tasks = checklist.getAllTasks();
      tasks.forEach((task) => {
        expect(task.id).toBeTruthy();
        expect(task.title).toBeTruthy();
        expect(task.category).toBeTruthy();
      });
    });
  });

  describe('getTask', () => {
    it('should return task by ID', () => {
      const task = checklist.getTask('complete-wizard');
      expect(task).toBeDefined();
      expect(task?.id).toBe('complete-wizard');
      expect(task?.title).toBe('Complete Quick Start Wizard');
    });

    it('should return undefined for non-existent task', () => {
      const task = checklist.getTask('non-existent');
      expect(task).toBeUndefined();
    });
  });

  describe('getTaskCompletion', () => {
    it('should return undefined for pending task', () => {
      const completion = checklist.getTaskCompletion('complete-wizard');
      expect(completion).toBeUndefined();
    });

    it('should return completion for started task', () => {
      checklist.startTask('complete-wizard');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion).toBeDefined();
      expect(completion?.status).toBe('in-progress');
      expect(completion?.startedAt).toBeGreaterThan(0);
    });
  });

  describe('startTask', () => {
    it('should mark task as in-progress', () => {
      checklist.startTask('complete-wizard');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion?.status).toBe('in-progress');
      expect(completion?.startedAt).toBeDefined();
    });

    it('should throw error for invalid task ID', () => {
      expect(() => checklist.startTask('invalid-task')).toThrow(
        'Task not found',
      );
    });

    it('should preserve startedAt when restarting', () => {
      checklist.startTask('complete-wizard');
      const firstStart = checklist.getTaskCompletion('complete-wizard')
        ?.startedAt;

      checklist.completeTask('complete-wizard');
      checklist.startTask('complete-wizard');
      const secondStart = checklist.getTaskCompletion('complete-wizard')
        ?.startedAt;

      expect(firstStart).toBe(secondStart);
    });

    it('should persist to disk', () => {
      checklist.startTask('complete-wizard');
      const statePath = path.join(tempDir, 'checklist-state.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(savedState.tasks['complete-wizard'].status).toBe('in-progress');
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', () => {
      checklist.completeTask('complete-wizard');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion?.status).toBe('completed');
      expect(completion?.completedAt).toBeDefined();
    });

    it('should update progress', () => {
      const progressBefore = checklist.getState().progress;
      checklist.completeTask('complete-wizard');
      const progressAfter = checklist.getState().progress;

      expect(progressAfter).toBeGreaterThan(progressBefore);
    });

    it('should accept notes', () => {
      checklist.completeTask('complete-wizard', 'Test notes');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion?.notes).toBe('Test notes');
    });

    it('should throw error for invalid task ID', () => {
      expect(() => checklist.completeTask('invalid-task')).toThrow(
        'Task not found',
      );
    });

    it('should check for completion of essential tasks', () => {
      // Complete all essential tasks in order respecting prerequisites
      // Essential tasks: complete-wizard, authenticate, first-prompt,
      // explore-examples, run-example, configure-workspace
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('explore-examples');
      checklist.completeTask('run-example');
      checklist.completeTask('configure-workspace');

      const state = checklist.getState();
      expect(state.isComplete).toBe(true);
    });

    it('should not mark as complete if essential tasks remain', () => {
      checklist.completeTask('complete-wizard');
      const state = checklist.getState();
      expect(state.isComplete).toBe(false);
    });

    it('should enforce prerequisites before completing', () => {
      // 'authenticate' requires 'complete-wizard'
      expect(() => checklist.completeTask('authenticate')).toThrow(
        'Cannot complete task "Set Up Authentication": unmet prerequisites: Complete Quick Start Wizard',
      );
    });

    it('should allow completion when prerequisites are met', () => {
      // Complete prerequisite first
      checklist.completeTask('complete-wizard');

      // Now 'authenticate' should succeed
      expect(() => checklist.completeTask('authenticate')).not.toThrow();

      const completion = checklist.getTaskCompletion('authenticate');
      expect(completion?.status).toBe('completed');
    });

    it('should enforce multiple prerequisites', () => {
      // 'project-analysis' requires both 'use-file-context' and 'use-tools'
      expect(() => checklist.completeTask('project-analysis')).toThrow(
        'unmet prerequisites',
      );

      // Complete only one prerequisite
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('use-file-context');

      // Should still fail because 'use-tools' is not complete
      expect(() => checklist.completeTask('project-analysis')).toThrow(
        'unmet prerequisites',
      );

      // Complete second prerequisite
      checklist.completeTask('use-tools');

      // Now should succeed
      expect(() => checklist.completeTask('project-analysis')).not.toThrow();
    });

    it('should allow completion of tasks without prerequisites', () => {
      // 'complete-wizard' has no prerequisites
      expect(() => checklist.completeTask('complete-wizard')).not.toThrow();

      const completion = checklist.getTaskCompletion('complete-wizard');
      expect(completion?.status).toBe('completed');
    });

    it('should throw descriptive error with task titles', () => {
      try {
        checklist.completeTask('authenticate');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Set Up Authentication');
        expect(error.message).toContain('Complete Quick Start Wizard');
        expect(error.message).toContain('unmet prerequisites');
      }
    });

    it('should enforce transitive prerequisites', () => {
      // 'first-prompt' requires 'authenticate' which requires 'complete-wizard'
      expect(() => checklist.completeTask('first-prompt')).toThrow(
        'unmet prerequisites',
      );

      // Complete first level prerequisite
      checklist.completeTask('complete-wizard');

      // Still should fail because direct prerequisite not met
      expect(() => checklist.completeTask('first-prompt')).toThrow(
        'unmet prerequisites',
      );

      // Complete direct prerequisite
      checklist.completeTask('authenticate');

      // Now should succeed
      expect(() => checklist.completeTask('first-prompt')).not.toThrow();
    });
  });

  describe('skipTask', () => {
    it('should mark task as skipped', () => {
      checklist.skipTask('complete-wizard');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion?.status).toBe('skipped');
    });

    it('should throw error for invalid task ID', () => {
      expect(() => checklist.skipTask('invalid-task')).toThrow(
        'Task not found',
      );
    });

    it('should update progress', () => {
      checklist.skipTask('complete-wizard');
      const state = checklist.getState();
      expect(state.lastUpdatedAt).toBeGreaterThan(0);
    });
  });

  describe('resetTask', () => {
    it('should reset task to pending', () => {
      checklist.completeTask('complete-wizard');
      checklist.resetTask('complete-wizard');
      const completion = checklist.getTaskCompletion('complete-wizard');

      expect(completion?.status).toBe('pending');
    });

    it('should throw error for invalid task ID', () => {
      expect(() => checklist.resetTask('invalid-task')).toThrow(
        'Task not found',
      );
    });

    it('should update progress', () => {
      checklist.completeTask('complete-wizard');
      const progressBefore = checklist.getState().progress;

      checklist.resetTask('complete-wizard');
      const progressAfter = checklist.getState().progress;

      expect(progressAfter).toBeLessThan(progressBefore);
    });
  });

  describe('autoDetect', () => {
    it('should detect completed tasks', async () => {
      // Since no tasks have autoDetect functions in the base implementation,
      // this should return empty array
      const detected = await checklist.autoDetect();
      expect(Array.isArray(detected)).toBe(true);
    });

    it('should not re-detect already completed tasks', async () => {
      checklist.completeTask('complete-wizard');
      const detected = await checklist.autoDetect();

      // Should not include already completed tasks
      expect(detected).not.toContain('complete-wizard');
    });

    it('should skip manual verification tasks', async () => {
      const detected = await checklist.autoDetect();

      // Manual tasks like 'configure-settings' should not be auto-detected
      expect(detected).not.toContain('configure-settings');
    });
  });

  describe('getStats', () => {
    it('should calculate statistics correctly', () => {
      const stats = checklist.getStats();

      expect(stats.totalTasks).toBe(20);
      expect(stats.completedTasks).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.byCategory.essential.total).toBe(6);
      expect(stats.byCategory.core.total).toBe(8);
      expect(stats.byCategory.advanced.total).toBe(6);
    });

    it('should update completed count', () => {
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');

      const stats = checklist.getStats();
      expect(stats.completedTasks).toBe(2);
      expect(stats.byCategory.essential.completed).toBe(2);
    });

    it('should calculate completion rate', () => {
      // Complete 5 tasks (25%) in order respecting prerequisites
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('explore-examples');
      checklist.completeTask('run-example');

      const stats = checklist.getStats();
      expect(stats.completionRate).toBe(25);
    });

    it('should calculate average completion time', async () => {
      checklist.startTask('complete-wizard');
      await new Promise((resolve) => setTimeout(resolve, 10));
      checklist.completeTask('complete-wizard');

      const stats = checklist.getStats();
      expect(stats.averageCompletionTime).toBeGreaterThan(0);
    });

    it('should calculate time to first task', () => {
      checklist.completeTask('complete-wizard');
      const stats = checklist.getStats();

      expect(stats.timeToFirstTask).toBeDefined();
      expect(stats.timeToFirstTask).toBeGreaterThan(0);
    });
  });

  describe('getNextRecommendations', () => {
    it('should return recommendations', () => {
      const recommendations = checklist.getNextRecommendations(3);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeLessThanOrEqual(3);
    });

    it('should prioritize essential tasks', () => {
      const recommendations = checklist.getNextRecommendations(10);
      const categories = recommendations.map((r) => r.task.category);

      // Essential tasks should appear first
      const firstEssentialIndex = categories.indexOf('essential');
      const firstNonEssentialIndex = categories.findIndex(
        (c) => c !== 'essential',
      );

      if (firstEssentialIndex >= 0 && firstNonEssentialIndex >= 0) {
        expect(firstEssentialIndex).toBeLessThan(firstNonEssentialIndex);
      }
    });

    it('should respect prerequisites', () => {
      const recommendations = checklist.getNextRecommendations(10);

      recommendations.forEach((rec) => {
        if (rec.task.prerequisites) {
          // At this stage, prerequisites shouldn't be completed
          // So tasks with prerequisites should not appear unless prerequisites are met
          const prerequisitesMet = rec.task.prerequisites.every(
            (prereqId) =>
              checklist.getTaskCompletion(prereqId)?.status === 'completed',
          );
          expect(prerequisitesMet).toBe(true);
        }
      });
    });

    it('should not recommend completed tasks', () => {
      checklist.completeTask('complete-wizard');
      const recommendations = checklist.getNextRecommendations(10);

      const taskIds = recommendations.map((r) => r.task.id);
      expect(taskIds).not.toContain('complete-wizard');
    });

    it('should not recommend in-progress tasks', () => {
      checklist.startTask('complete-wizard');
      const recommendations = checklist.getNextRecommendations(10);

      const taskIds = recommendations.map((r) => r.task.id);
      expect(taskIds).not.toContain('complete-wizard');
    });

    it('should include priority and reason', () => {
      const recommendations = checklist.getNextRecommendations(3);

      recommendations.forEach((rec) => {
        expect(rec.task).toBeDefined();
        expect(rec.reason).toBeTruthy();
        expect(typeof rec.priority).toBe('number');
        expect(rec.priority).toBeGreaterThan(0);
      });
    });

    it('should boost priority for blocking tasks', () => {
      // 'complete-wizard' is a prerequisite for multiple tasks
      const recommendations = checklist.getNextRecommendations(10);
      const wizardRec = recommendations.find(
        (r) => r.task.id === 'complete-wizard',
      );

      if (wizardRec) {
        // Should have high priority due to being a blocker
        expect(wizardRec.priority).toBeGreaterThan(5);
      }
    });

    it('should respect limit parameter', () => {
      const recommendations1 = checklist.getNextRecommendations(1);
      const recommendations3 = checklist.getNextRecommendations(3);
      const recommendations10 = checklist.getNextRecommendations(10);

      expect(recommendations1.length).toBeLessThanOrEqual(1);
      expect(recommendations3.length).toBeLessThanOrEqual(3);
      expect(recommendations10.length).toBeLessThanOrEqual(10);
    });
  });

  describe('reset', () => {
    it('should reset all tasks', () => {
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.reset();

      const state = checklist.getState();
      expect(Object.keys(state.tasks).length).toBe(0);
      expect(state.progress).toBe(0);
      expect(state.isComplete).toBe(false);
    });

    it('should reset timestamps', () => {
      const timeBefore = Date.now();
      checklist.reset();
      const state = checklist.getState();

      expect(state.startedAt).toBeGreaterThanOrEqual(timeBefore);
      expect(state.lastUpdatedAt).toBeGreaterThanOrEqual(timeBefore);
    });
  });

  describe('persistence', () => {
    it('should load existing state from disk', () => {
      checklist.completeTask('complete-wizard');
      checklist.startTask('authenticate');

      // Create new instance with same state path
      const statePath = path.join(tempDir, 'checklist-state.json');
      const checklist2 = new OnboardingChecklist(statePath);
      const state = checklist2.getState();

      expect(state.tasks['complete-wizard'].status).toBe('completed');
      expect(state.tasks['authenticate'].status).toBe('in-progress');
    });

    it('should handle missing state file gracefully', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent', 'state.json');
      const checklist2 = new OnboardingChecklist(nonExistentPath);
      const state = checklist2.getState();

      expect(state.progress).toBe(0);
      expect(state.isComplete).toBe(false);
    });

    it('should handle corrupted state file gracefully', () => {
      const statePath = path.join(tempDir, 'checklist-state.json');
      fs.writeFileSync(statePath, 'invalid json{]', 'utf8');

      const checklist2 = new OnboardingChecklist(statePath);
      const state = checklist2.getState();

      expect(state.progress).toBe(0);
      expect(state.isComplete).toBe(false);
    });

    it('should create config directory if it does not exist', () => {
      const newTempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'checklist-test-new-'),
      );
      const nestedPath = path.join(
        newTempDir,
        'nested',
        'dir',
        'checklist-state.json',
      );

      const checklist2 = new OnboardingChecklist(nestedPath);
      checklist2.completeTask('complete-wizard');

      expect(fs.existsSync(nestedPath)).toBe(true);

      // Cleanup
      fs.rmSync(newTempDir, { recursive: true, force: true });
    });
  });

  describe('progress calculation', () => {
    it('should update progress on task completion', () => {
      expect(checklist.getState().progress).toBe(0);

      checklist.completeTask('complete-wizard');
      expect(checklist.getState().progress).toBe(5); // 1/20 = 5%

      checklist.completeTask('authenticate');
      expect(checklist.getState().progress).toBe(10); // 2/20 = 10%
    });

    it('should reach 100% when all tasks complete', () => {
      completeAllTasksInOrder(checklist);

      expect(checklist.getState().progress).toBe(100);
    });

    it('should round progress to nearest integer', () => {
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');

      const progress = checklist.getState().progress;
      expect(Number.isInteger(progress)).toBe(true);
      expect(progress).toBe(15); // 3/20 = 15%
    });
  });

  describe('completion detection', () => {
    it('should mark as complete when all essential tasks done', () => {
      // Complete all 6 essential tasks in dependency order
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('explore-examples');
      checklist.completeTask('run-example');
      checklist.completeTask('configure-workspace');

      expect(checklist.getState().isComplete).toBe(true);
    });

    it('should not mark as complete with only core tasks', () => {
      // Core tasks require essential tasks as prerequisites
      // Complete prerequisites first
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('explore-examples');
      checklist.completeTask('run-example');

      // Now complete some core tasks
      checklist.completeTask('use-file-context');
      checklist.completeTask('multimodal-prompt');
      checklist.completeTask('use-tools');

      // Should not be complete because not all essential tasks done
      // (missing configure-workspace)
      expect(checklist.getState().isComplete).toBe(false);
    });

    it('should remain incomplete if any essential task is skipped', () => {
      // Complete some essential tasks
      checklist.completeTask('complete-wizard');
      checklist.completeTask('authenticate');
      checklist.completeTask('first-prompt');
      checklist.completeTask('explore-examples');
      checklist.completeTask('run-example');

      // Skip the last essential task
      checklist.skipTask('configure-workspace');

      expect(checklist.getState().isComplete).toBe(false);
    });
  });
});

describe('Singleton functions', () => {
  afterEach(() => {
    resetChecklist();
  });

  describe('getChecklist', () => {
    it('should return the same instance on multiple calls', () => {
      const checklist1 = getChecklist();
      const checklist2 = getChecklist();
      expect(checklist1).toBe(checklist2);
    });
  });

  describe('resetChecklist', () => {
    it('should reset singleton instance', () => {
      const checklist1 = getChecklist();
      resetChecklist();
      const checklist2 = getChecklist();
      expect(checklist1).not.toBe(checklist2);
    });
  });
});
