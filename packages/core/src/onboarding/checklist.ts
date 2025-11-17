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
 * Onboarding Checklist System
 *
 * Manages the onboarding checklist with task tracking, progress monitoring,
 * and automatic completion detection.
 *
 * @module onboarding/checklist
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  OnboardingTask,
  ChecklistState,
  TaskCompletion,
  TaskStatus,
  TaskCategory,
  OnboardingStats,
  NextStepRecommendation,
} from './types.js';

/**
 * Get the checklist state file path
 */
function getChecklistStatePath(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.gemini-cli');
  return path.join(configDir, 'onboarding-checklist.json');
}

/**
 * Onboarding task definitions
 */
export const ONBOARDING_TASKS: OnboardingTask[] = [
  // Essential Tasks (6 tasks)
  {
    id: 'complete-wizard',
    title: 'Complete Quick Start Wizard',
    description: 'Finish the initial setup wizard',
    category: 'essential',
    estimatedTime: '5 minutes',
    command: '/wizard start',
    verificationMethod: 'automatic',
    helpText: 'Run /wizard start to begin the setup process',
    docLink: '/docs/get-started/wizard.md',
  },
  {
    id: 'authenticate',
    title: 'Set Up Authentication',
    description: 'Configure your Gemini API access',
    category: 'essential',
    estimatedTime: '2 minutes',
    verificationMethod: 'automatic',
    helpText:
      'Choose OAuth, API key, or Vertex AI authentication in the wizard',
    docLink: '/docs/get-started/authentication.md',
    prerequisites: ['complete-wizard'],
  },
  {
    id: 'first-prompt',
    title: 'Send Your First Prompt',
    description: 'Try asking Gemini a question',
    category: 'essential',
    estimatedTime: '1 minute',
    verificationMethod: 'automatic',
    helpText: 'Type any question or command and press Enter',
    docLink: '/docs/get-started/first-prompt.md',
    prerequisites: ['authenticate'],
  },
  {
    id: 'explore-examples',
    title: 'Browse Example Library',
    description: 'Discover what Gemini CLI can do',
    category: 'essential',
    estimatedTime: '5 minutes',
    command: '/examples',
    verificationMethod: 'automatic',
    helpText: 'Run /examples to see available use cases',
    docLink: '/docs/features/example-library.md',
    prerequisites: ['first-prompt'],
  },
  {
    id: 'run-example',
    title: 'Run an Example',
    description: 'Try running a real-world example',
    category: 'essential',
    estimatedTime: '3 minutes',
    command: '/examples run <example-id>',
    verificationMethod: 'automatic',
    helpText: 'Choose an example from /examples and run it',
    docLink: '/docs/features/example-library.md',
    prerequisites: ['explore-examples'],
  },
  {
    id: 'configure-workspace',
    title: 'Configure Your Workspace',
    description: 'Set up your working directory and permissions',
    category: 'essential',
    estimatedTime: '3 minutes',
    verificationMethod: 'automatic',
    helpText: 'Configure trust levels and directory access',
    docLink: '/docs/get-started/workspace.md',
    prerequisites: ['complete-wizard'],
  },

  // Core Feature Tasks (8 tasks)
  {
    id: 'use-file-context',
    title: 'Use @ File References',
    description: 'Reference files in your prompts with @ syntax',
    category: 'core',
    estimatedTime: '5 minutes',
    verificationMethod: 'automatic',
    helpText: 'Try: "Explain @src/app.ts"',
    docLink: '/docs/features/file-references.md',
    prerequisites: ['first-prompt'],
  },
  {
    id: 'multimodal-prompt',
    title: 'Send a Multimodal Prompt',
    description: 'Include images in your prompts',
    category: 'core',
    estimatedTime: '5 minutes',
    verificationMethod: 'automatic',
    helpText: 'Reference an image file with @ syntax',
    docLink: '/docs/features/multimodal.md',
    prerequisites: ['use-file-context'],
  },
  {
    id: 'save-custom-command',
    title: 'Save a Custom Command',
    description: 'Create your own reusable command',
    category: 'core',
    estimatedTime: '5 minutes',
    command: '/examples save <example-id> <command-name>',
    verificationMethod: 'automatic',
    helpText: 'Save an example as a custom command',
    docLink: '/docs/features/custom-commands.md',
    prerequisites: ['run-example'],
  },
  {
    id: 'use-tools',
    title: 'Try Tool Usage',
    description: 'Let Gemini use tools to accomplish tasks',
    category: 'core',
    estimatedTime: '10 minutes',
    verificationMethod: 'automatic',
    helpText: 'Ask Gemini to perform a task that requires tools',
    docLink: '/docs/features/tools.md',
    prerequisites: ['first-prompt'],
  },
  {
    id: 'review-history',
    title: 'Review Your History',
    description: 'See your past interactions',
    category: 'core',
    estimatedTime: '2 minutes',
    command: '/history',
    verificationMethod: 'automatic',
    helpText: 'Run /history to see your conversation history',
    docLink: '/docs/features/history.md',
    prerequisites: ['first-prompt'],
  },
  {
    id: 'rate-example',
    title: 'Rate an Example',
    description: 'Provide feedback on an example you used',
    category: 'core',
    estimatedTime: '1 minute',
    command: '/examples rate <example-id> <1-5> [notes]',
    verificationMethod: 'automatic',
    helpText: 'Rate examples to help improve them',
    docLink: '/docs/features/example-library.md',
    prerequisites: ['run-example'],
  },
  {
    id: 'configure-settings',
    title: 'Customize Settings',
    description: 'Adjust CLI settings to your preferences',
    category: 'core',
    estimatedTime: '5 minutes',
    verificationMethod: 'manual',
    helpText: 'Explore available settings and configurations',
    docLink: '/docs/configuration/settings.md',
    prerequisites: ['complete-wizard'],
  },
  {
    id: 'explore-search',
    title: 'Search Examples',
    description: 'Find examples by keyword or tag',
    category: 'core',
    estimatedTime: '3 minutes',
    command: '/examples search <query>',
    verificationMethod: 'automatic',
    helpText: 'Search for examples by keyword',
    docLink: '/docs/features/example-library.md',
    prerequisites: ['explore-examples'],
  },

  // Advanced Feature Tasks (6 tasks)
  {
    id: 'use-variables',
    title: 'Use Variable Substitution',
    description: 'Create templates with variables',
    category: 'advanced',
    estimatedTime: '10 minutes',
    verificationMethod: 'automatic',
    helpText: 'Run examples that use {{variable}} syntax',
    docLink: '/docs/features/variables.md',
    prerequisites: ['run-example'],
  },
  {
    id: 'batch-processing',
    title: 'Process Multiple Files',
    description: 'Use Gemini to process files in batch',
    category: 'advanced',
    estimatedTime: '15 minutes',
    verificationMethod: 'automatic',
    helpText: 'Try a batch processing example',
    docLink: '/docs/features/batch-processing.md',
    prerequisites: ['use-tools'],
  },
  {
    id: 'advanced-tools',
    title: 'Use Advanced Tools',
    description: 'Explore shell execution and complex workflows',
    category: 'advanced',
    estimatedTime: '15 minutes',
    verificationMethod: 'manual',
    helpText: 'Experiment with advanced tool capabilities',
    docLink: '/docs/features/advanced-tools.md',
    prerequisites: ['use-tools'],
  },
  {
    id: 'project-analysis',
    title: 'Analyze a Project',
    description: 'Use Gemini to understand a codebase',
    category: 'advanced',
    estimatedTime: '20 minutes',
    verificationMethod: 'automatic',
    helpText: 'Run project analysis examples',
    docLink: '/docs/use-cases/project-analysis.md',
    prerequisites: ['use-file-context', 'use-tools'],
  },
  {
    id: 'create-workflow',
    title: 'Create a Workflow',
    description: 'Chain multiple operations together',
    category: 'advanced',
    estimatedTime: '20 minutes',
    verificationMethod: 'manual',
    helpText: 'Combine multiple prompts into a workflow',
    docLink: '/docs/features/workflows.md',
    prerequisites: ['use-tools', 'save-custom-command'],
  },
  {
    id: 'share-feedback',
    title: 'Share Feedback',
    description: 'Help us improve Gemini CLI',
    category: 'advanced',
    estimatedTime: '5 minutes',
    verificationMethod: 'manual',
    helpText: 'Rate examples and report issues',
    docLink: '/docs/contributing/feedback.md',
    prerequisites: ['rate-example'],
  },
];

/**
 * Onboarding Checklist Manager
 */
export class OnboardingChecklist {
  private state: ChecklistState;
  private statePath: string;
  private tasks: Map<string, OnboardingTask>;

  constructor(statePath?: string) {
    this.statePath = statePath || getChecklistStatePath();
    this.tasks = new Map(ONBOARDING_TASKS.map((t) => [t.id, t]));
    this.state = this.load();
  }

  /**
   * Get current state
   */
  getState(): ChecklistState {
    return { ...this.state };
  }

  /**
   * Get all tasks
   */
  getAllTasks(): OnboardingTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): OnboardingTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get task completion
   */
  getTaskCompletion(taskId: string): TaskCompletion | undefined {
    return this.state.tasks[taskId];
  }

  /**
   * Start a task
   */
  startTask(taskId: string): void {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const existing = this.state.tasks[taskId];
    this.state.tasks[taskId] = {
      taskId,
      status: 'in-progress',
      startedAt: existing?.startedAt || Date.now(),
    };

    this.updateProgress();
    this.save();
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, notes?: string): void {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Validate prerequisites before completing
    const task = this.tasks.get(taskId)!;
    if (task.prerequisites && task.prerequisites.length > 0) {
      const unmetPrerequisites = task.prerequisites.filter(
        (prereqId) => this.state.tasks[prereqId]?.status !== 'completed',
      );

      if (unmetPrerequisites.length > 0) {
        const unmetTasks = unmetPrerequisites
          .map((id) => this.tasks.get(id)?.title || id)
          .join(', ');
        throw new Error(
          `Cannot complete task "${task.title}": unmet prerequisites: ${unmetTasks}`,
        );
      }
    }

    const existing = this.state.tasks[taskId];
    this.state.tasks[taskId] = {
      taskId,
      status: 'completed',
      startedAt: existing?.startedAt || Date.now(),
      completedAt: Date.now(),
      notes,
    };

    this.updateProgress();
    this.checkCompletion();
    this.save();
  }

  /**
   * Skip a task
   */
  skipTask(taskId: string): void {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.state.tasks[taskId] = {
      taskId,
      status: 'skipped',
    };

    this.updateProgress();
    this.save();
  }

  /**
   * Reset a task
   */
  resetTask(taskId: string): void {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.state.tasks[taskId] = {
      taskId,
      status: 'pending',
    };

    this.updateProgress();
    this.save();
  }

  /**
   * Auto-detect completed tasks
   */
  async autoDetect(): Promise<string[]> {
    const detected: string[] = [];

    for (const task of this.tasks.values()) {
      // Skip if already completed or no auto-detection
      if (
        this.state.tasks[task.id]?.status === 'completed' ||
        task.verificationMethod !== 'automatic' ||
        !task.autoDetect
      ) {
        continue;
      }

      try {
        const isComplete = await task.autoDetect();
        if (isComplete) {
          this.completeTask(
            task.id,
            'Automatically detected as completed',
          );
          detected.push(task.id);
        }
      } catch (error) {
        console.error(`Failed to auto-detect task ${task.id}:`, error);
      }
    }

    return detected;
  }

  /**
   * Get statistics
   */
  getStats(): OnboardingStats {
    const byCategory: Record<
      TaskCategory,
      { total: number; completed: number }
    > = {
      essential: { total: 0, completed: 0 },
      core: { total: 0, completed: 0 },
      advanced: { total: 0, completed: 0 },
    };

    let completedTasks = 0;
    const completionTimes: number[] = [];

    for (const task of this.tasks.values()) {
      byCategory[task.category].total++;

      const completion = this.state.tasks[task.id];
      if (completion?.status === 'completed') {
        byCategory[task.category].completed++;
        completedTasks++;

        if (completion.startedAt && completion.completedAt) {
          completionTimes.push(
            completion.completedAt - completion.startedAt,
          );
        }
      }
    }

    const averageCompletionTime =
      completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : undefined;

    // Time to first completed task
    const firstCompletion = Object.values(this.state.tasks)
      .filter((t) => t.status === 'completed' && t.completedAt)
      .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0))[0];

    const timeToFirstTask = firstCompletion?.completedAt
      ? firstCompletion.completedAt - this.state.startedAt
      : undefined;

    return {
      totalTasks: this.tasks.size,
      completedTasks,
      byCategory,
      averageCompletionTime,
      timeToFirstTask,
      completionRate: (completedTasks / this.tasks.size) * 100,
    };
  }

  /**
   * Get next recommended tasks
   */
  getNextRecommendations(limit = 3): NextStepRecommendation[] {
    const recommendations: NextStepRecommendation[] = [];

    for (const task of this.tasks.values()) {
      const completion = this.state.tasks[task.id];

      // Skip completed or in-progress tasks
      if (
        completion?.status === 'completed' ||
        completion?.status === 'in-progress'
      ) {
        continue;
      }

      // Check prerequisites
      const prerequisitesMet =
        !task.prerequisites ||
        task.prerequisites.every(
          (prereqId) =>
            this.state.tasks[prereqId]?.status === 'completed',
        );

      if (!prerequisitesMet) continue;

      // Calculate priority
      let priority = 0;

      // Essential tasks get highest priority
      if (task.category === 'essential') priority += 5;
      else if (task.category === 'core') priority += 3;
      else priority += 1;

      // Boost priority if it's blocking other tasks
      const blockingCount = Array.from(this.tasks.values()).filter((t) =>
        t.prerequisites?.includes(task.id),
      ).length;
      priority += blockingCount;

      recommendations.push({
        task,
        reason: this.getRecommendationReason(task, blockingCount),
        priority,
      });
    }

    // Sort by priority and return top N
    return recommendations
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  /**
   * Get recommendation reason
   */
  private getRecommendationReason(
    task: OnboardingTask,
    blockingCount: number,
  ): string {
    if (task.category === 'essential') {
      return 'Essential for getting started';
    }

    if (blockingCount > 0) {
      return `Unlocks ${blockingCount} other task${blockingCount > 1 ? 's' : ''}`;
    }

    if (task.category === 'core') {
      return 'Important core feature';
    }

    return 'Recommended next step';
  }

  /**
   * Update progress percentage
   */
  private updateProgress(): void {
    const completed = Object.values(this.state.tasks).filter(
      (t) => t.status === 'completed',
    ).length;

    this.state.progress = Math.round((completed / this.tasks.size) * 100);
    this.state.lastUpdatedAt = Date.now();
  }

  /**
   * Check if onboarding is complete
   */
  private checkCompletion(): void {
    // Consider complete if all essential tasks are done
    const essentialTasks = Array.from(this.tasks.values()).filter(
      (t) => t.category === 'essential',
    );

    const allEssentialComplete = essentialTasks.every(
      (task) => this.state.tasks[task.id]?.status === 'completed',
    );

    this.state.isComplete = allEssentialComplete;
  }

  /**
   * Reset checklist
   */
  reset(): void {
    this.state = {
      tasks: {},
      progress: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      isComplete: false,
    };
    this.save();
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
      console.error('Failed to save checklist state:', error);
    }
  }

  /**
   * Load state from disk
   */
  private load(): ChecklistState {
    try {
      if (fs.existsSync(this.statePath)) {
        const json = fs.readFileSync(this.statePath, 'utf8');
        return JSON.parse(json);
      }
    } catch (error) {
      console.error('Failed to load checklist state:', error);
    }

    // Default state
    return {
      tasks: {},
      progress: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      isComplete: false,
    };
  }
}

/**
 * Singleton instance
 */
let checklistInstance: OnboardingChecklist | null = null;

/**
 * Get the global checklist instance
 */
export function getChecklist(): OnboardingChecklist {
  if (!checklistInstance) {
    checklistInstance = new OnboardingChecklist();
  }
  return checklistInstance;
}

/**
 * Reset the global checklist instance (mainly for testing)
 */
export function resetChecklist(): void {
  checklistInstance = null;
}
