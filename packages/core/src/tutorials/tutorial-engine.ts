/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TutorialModule, TutorialProgress, TutorialStats } from './types.js';
import { TUTORIAL_MODULES } from './modules.js';

function getTutorialStatePath(): string {
  return path.join(os.homedir(), '.gemini-cli', 'tutorial-progress.json');
}

export class TutorialEngine {
  private progress: Map<string, TutorialProgress> = new Map();
  private statePath: string;

  constructor(statePath?: string) {
    this.statePath = statePath || getTutorialStatePath();
    this.loadProgress();
  }

  getModules(): TutorialModule[] {
    return TUTORIAL_MODULES;
  }

  getModule(id: string): TutorialModule | undefined {
    return TUTORIAL_MODULES.find((m) => m.id === id);
  }

  startModule(moduleId: string): void {
    const module = this.getModule(moduleId);
    if (!module) throw new Error(`Module not found: ${moduleId}`);

    this.progress.set(moduleId, {
      moduleId,
      currentStep: 0,
      completedSteps: [],
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      completed: false,
    });
    this.saveProgress();
  }

  getProgress(moduleId: string): TutorialProgress | undefined {
    return this.progress.get(moduleId);
  }

  completeStep(moduleId: string, stepIndex: number): void {
    const progress = this.progress.get(moduleId);
    if (!progress) throw new Error(`No progress for module: ${moduleId}`);

    if (!progress.completedSteps.includes(stepIndex)) {
      progress.completedSteps.push(stepIndex);
    }
    progress.lastUpdatedAt = Date.now();

    const module = this.getModule(moduleId);
    if (module && progress.completedSteps.length === module.steps.length) {
      progress.completed = true;
      progress.score = 100;
    }

    this.saveProgress();
  }

  nextStep(moduleId: string): number {
    const progress = this.progress.get(moduleId);
    if (!progress) throw new Error(`No progress for module: ${moduleId}`);

    const module = this.getModule(moduleId);
    if (!module) throw new Error(`Module not found: ${moduleId}`);

    if (progress.currentStep < module.steps.length - 1) {
      progress.currentStep++;
      progress.lastUpdatedAt = Date.now();
      this.saveProgress();
    }

    return progress.currentStep;
  }

  previousStep(moduleId: string): number {
    const progress = this.progress.get(moduleId);
    if (!progress) throw new Error(`No progress for module: ${moduleId}`);

    if (progress.currentStep > 0) {
      progress.currentStep--;
      progress.lastUpdatedAt = Date.now();
      this.saveProgress();
    }

    return progress.currentStep;
  }

  getStats(): TutorialStats {
    const totalModules = TUTORIAL_MODULES.length;
    const completedModules = Array.from(this.progress.values()).filter(
      (p) => p.completed,
    ).length;
    const inProgressModules = Array.from(this.progress.values()).filter(
      (p) => !p.completed && p.completedSteps.length > 0,
    ).length;

    const totalSteps = TUTORIAL_MODULES.reduce((sum, m) => sum + m.steps.length, 0);
    const completedSteps = Array.from(this.progress.values()).reduce(
      (sum, p) => sum + p.completedSteps.length,
      0,
    );

    const scores = Array.from(this.progress.values())
      .filter((p) => p.score !== undefined)
      .map((p) => p.score!);
    const averageScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    return {
      totalModules,
      completedModules,
      inProgressModules,
      totalSteps,
      completedSteps,
      averageScore,
      timeSpent: 0,
    };
  }

  private loadProgress(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        this.progress = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Failed to load tutorial progress:', error);
    }
  }

  private saveProgress(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.progress);
      fs.writeFileSync(this.statePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save tutorial progress:', error);
    }
  }
}

let engineInstance: TutorialEngine | null = null;

export function getTutorialEngine(): TutorialEngine {
  if (!engineInstance) {
    engineInstance = new TutorialEngine();
  }
  return engineInstance;
}

export function resetTutorialEngine(): void {
  engineInstance = null;
}
