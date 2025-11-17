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
  TutorialEngine,
  TUTORIAL_MODULES,
  getTutorialEngine,
  resetTutorialEngine,
} from './tutorial-engine.js';

describe('TUTORIAL_MODULES', () => {
  it('should have 10 tutorial modules', () => {
    expect(TUTORIAL_MODULES).toHaveLength(10);
  });

  it('should have unique module IDs', () => {
    const ids = TUTORIAL_MODULES.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(TUTORIAL_MODULES.length);
  });

  it('should have all required fields', () => {
    TUTORIAL_MODULES.forEach((module) => {
      expect(module.id).toBeTruthy();
      expect(module.title).toBeTruthy();
      expect(module.description).toBeTruthy();
      expect(['beginner', 'intermediate', 'advanced']).toContain(
        module.difficulty,
      );
      expect(module.estimatedTime).toBeTruthy();
      expect(Array.isArray(module.steps)).toBe(true);
      expect(module.steps.length).toBeGreaterThan(0);
      expect(Array.isArray(module.objectives)).toBe(true);
      expect(module.objectives.length).toBeGreaterThan(0);
    });
  });

  it('should have valid step types', () => {
    const validTypes = ['instruction', 'exercise', 'quiz', 'practice'];
    TUTORIAL_MODULES.forEach((module) => {
      module.steps.forEach((step) => {
        expect(validTypes).toContain(step.type);
        expect(step.title).toBeTruthy();
        expect(step.content).toBeTruthy();
      });
    });
  });

  it('should have valid prerequisite references', () => {
    const allIds = new Set(TUTORIAL_MODULES.map((m) => m.id));

    TUTORIAL_MODULES.forEach((module) => {
      if (module.prerequisites) {
        module.prerequisites.forEach((prereqId) => {
          expect(allIds.has(prereqId)).toBe(true);
        });
      }
    });
  });

  it('should have exercises with validation functions', () => {
    TUTORIAL_MODULES.forEach((module) => {
      module.steps.forEach((step) => {
        if (step.type === 'exercise' && step.exercise) {
          expect(step.exercise.task).toBeTruthy();
          expect(typeof step.exercise.validation).toBe('function');
        }
      });
    });
  });

  it('should have quizzes with correct answers', () => {
    TUTORIAL_MODULES.forEach((module) => {
      module.steps.forEach((step) => {
        if (step.type === 'quiz' && step.quiz) {
          expect(step.quiz.question).toBeTruthy();
          expect(Array.isArray(step.quiz.options)).toBe(true);
          expect(step.quiz.options.length).toBeGreaterThan(1);
          expect(step.quiz.correctAnswer).toBeGreaterThanOrEqual(0);
          expect(step.quiz.correctAnswer).toBeLessThan(step.quiz.options.length);
        }
      });
    });
  });
});

describe('TutorialEngine', () => {
  let tempDir: string;
  let engine: TutorialEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-test-'));
    const statePath = path.join(tempDir, 'progress.json');
    engine = new TutorialEngine(statePath);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getModules', () => {
    it('should return all tutorial modules', () => {
      const modules = engine.getModules();
      expect(modules).toHaveLength(10);
      expect(modules[0].id).toBe('getting-started');
    });
  });

  describe('getModule', () => {
    it('should return module by ID', () => {
      const module = engine.getModule('getting-started');
      expect(module).toBeDefined();
      expect(module?.title).toBe('Getting Started');
    });

    it('should return undefined for non-existent module', () => {
      const module = engine.getModule('non-existent');
      expect(module).toBeUndefined();
    });
  });

  describe('startModule', () => {
    it('should start a new module', () => {
      engine.startModule('getting-started');
      const progress = engine.getProgress('getting-started');

      expect(progress).toBeDefined();
      expect(progress?.moduleId).toBe('getting-started');
      expect(progress?.currentStep).toBe(0);
      expect(progress?.completed).toBe(false);
      expect(progress?.completedSteps).toEqual([]);
    });

    it('should track start time', () => {
      const before = Date.now();
      engine.startModule('getting-started');
      const progress = engine.getProgress('getting-started');
      const after = Date.now();

      expect(progress?.startedAt).toBeGreaterThanOrEqual(before);
      expect(progress?.startedAt).toBeLessThanOrEqual(after);
    });

    it('should not reset progress if module already started', () => {
      engine.startModule('getting-started');
      engine.completeStep('getting-started', 0);

      engine.startModule('getting-started');
      const progress = engine.getProgress('getting-started');

      expect(progress?.completedSteps).toEqual([0]);
    });
  });

  describe('completeStep', () => {
    beforeEach(() => {
      engine.startModule('getting-started');
    });

    it('should mark step as completed', () => {
      engine.completeStep('getting-started', 0);
      const progress = engine.getProgress('getting-started');

      expect(progress?.completedSteps).toContain(0);
    });

    it('should not duplicate completed steps', () => {
      engine.completeStep('getting-started', 0);
      engine.completeStep('getting-started', 0);
      const progress = engine.getProgress('getting-started');

      expect(progress?.completedSteps).toEqual([0]);
    });

    it('should mark module as completed when all steps done', () => {
      const module = engine.getModule('getting-started');
      module?.steps.forEach((_, i) => {
        engine.completeStep('getting-started', i);
      });

      const progress = engine.getProgress('getting-started');
      expect(progress?.completed).toBe(true);
      expect(progress?.completedAt).toBeDefined();
    });
  });

  describe('nextStep', () => {
    beforeEach(() => {
      engine.startModule('getting-started');
    });

    it('should advance to next step', () => {
      const nextIndex = engine.nextStep('getting-started');
      expect(nextIndex).toBe(1);

      const progress = engine.getProgress('getting-started');
      expect(progress?.currentStep).toBe(1);
    });

    it('should not advance beyond last step', () => {
      const module = engine.getModule('getting-started');
      const lastIndex = module!.steps.length - 1;

      for (let i = 0; i <= lastIndex + 5; i++) {
        engine.nextStep('getting-started');
      }

      const progress = engine.getProgress('getting-started');
      expect(progress?.currentStep).toBe(lastIndex);
    });
  });

  describe('previousStep', () => {
    beforeEach(() => {
      engine.startModule('getting-started');
    });

    it('should go to previous step', () => {
      engine.nextStep('getting-started');
      engine.nextStep('getting-started');

      const prevIndex = engine.previousStep('getting-started');
      expect(prevIndex).toBe(1);
    });

    it('should not go below step 0', () => {
      for (let i = 0; i < 5; i++) {
        engine.previousStep('getting-started');
      }

      const progress = engine.getProgress('getting-started');
      expect(progress?.currentStep).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = engine.getStats();
      expect(stats.totalModules).toBe(10);
      expect(stats.completedModules).toBe(0);
      expect(stats.inProgressModules).toBe(0);
      expect(stats.totalTimeSpent).toBe(0);
    });

    it('should count in-progress modules', () => {
      engine.startModule('getting-started');
      const stats = engine.getStats();

      expect(stats.inProgressModules).toBe(1);
    });

    it('should count completed modules', () => {
      engine.startModule('getting-started');
      const module = engine.getModule('getting-started');

      module?.steps.forEach((_, i) => {
        engine.completeStep('getting-started', i);
      });

      const stats = engine.getStats();
      expect(stats.completedModules).toBe(1);
    });

    it('should track total time spent', () => {
      engine.startModule('getting-started');

      // Simulate time passage
      const progress = engine.getProgress('getting-started');
      if (progress) {
        progress.startedAt = Date.now() - 60000; // 1 minute ago
      }

      const stats = engine.getStats();
      expect(stats.totalTimeSpent).toBeGreaterThan(0);
    });
  });

  describe('persistence', () => {
    it('should persist progress to file', () => {
      engine.startModule('getting-started');
      engine.completeStep('getting-started', 0);

      const statePath = path.join(tempDir, 'progress.json');
      expect(fs.existsSync(statePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      expect(data['getting-started']).toBeDefined();
      expect(data['getting-started'].completedSteps).toContain(0);
    });

    it('should load progress from file', () => {
      engine.startModule('getting-started');
      engine.completeStep('getting-started', 0);

      const statePath = path.join(tempDir, 'progress.json');
      const newEngine = new TutorialEngine(statePath);
      const progress = newEngine.getProgress('getting-started');

      expect(progress?.completedSteps).toContain(0);
    });
  });
});

describe('getTutorialEngine', () => {
  afterEach(() => {
    resetTutorialEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getTutorialEngine();
    const engine2 = getTutorialEngine();
    expect(engine1).toBe(engine2);
  });

  it('should create new instance after reset', () => {
    const engine1 = getTutorialEngine();
    resetTutorialEngine();
    const engine2 = getTutorialEngine();
    expect(engine1).not.toBe(engine2);
  });
});
