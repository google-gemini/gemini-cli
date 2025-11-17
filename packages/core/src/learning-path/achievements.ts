/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Achievement } from './types.js';

export const ACHIEVEMENTS: Achievement[] = [
  // Getting Started
  {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Execute your first command',
    category: 'getting-started',
    xp: 10,
    icon: '👣',
    unlockCondition: (stats) => stats.commandsExecuted >= 1,
  },
  {
    id: 'active-user',
    title: 'Active User',
    description: 'Use Gemini CLI for 7 days',
    category: 'getting-started',
    xp: 50,
    icon: '📅',
    unlockCondition: (stats) => stats.daysActive >= 7,
  },
  {
    id: 'streak-starter',
    title: 'Streak Starter',
    description: 'Maintain a 3-day streak',
    category: 'getting-started',
    xp: 30,
    icon: '🔥',
    unlockCondition: (stats) => stats.streak >= 3,
  },
  {
    id: 'streak-master',
    title: 'Streak Master',
    description: 'Maintain a 7-day streak',
    category: 'getting-started',
    xp: 100,
    icon: '🔥🔥',
    unlockCondition: (stats) => stats.streak >= 7,
  },
  {
    id: 'dedication',
    title: 'Dedication',
    description: 'Maintain a 30-day streak',
    category: 'getting-started',
    xp: 500,
    icon: '🔥🔥🔥',
    unlockCondition: (stats) => stats.streak >= 30,
  },

  // Wizard
  {
    id: 'wizard-complete',
    title: 'Guided Journey',
    description: 'Complete the Quick Start Wizard',
    category: 'wizard',
    xp: 50,
    icon: '🧙',
    unlockCondition: (stats) => stats.wizardCompleted,
  },

  // Onboarding
  {
    id: 'first-task',
    title: 'Task Beginner',
    description: 'Complete your first onboarding task',
    category: 'onboarding',
    xp: 20,
    icon: '✅',
    unlockCondition: (stats) => stats.tasksCompleted >= 1,
  },
  {
    id: 'task-enthusiast',
    title: 'Task Enthusiast',
    description: 'Complete 5 onboarding tasks',
    category: 'onboarding',
    xp: 50,
    icon: '✅✅',
    unlockCondition: (stats) => stats.tasksCompleted >= 5,
  },
  {
    id: 'task-master',
    title: 'Task Master',
    description: 'Complete 10 onboarding tasks',
    category: 'onboarding',
    xp: 100,
    icon: '✅✅✅',
    unlockCondition: (stats) => stats.tasksCompleted >= 10,
  },
  {
    id: 'fully-onboarded',
    title: 'Fully Onboarded',
    description: 'Complete all 20 onboarding tasks',
    category: 'onboarding',
    xp: 200,
    icon: '🎓',
    unlockCondition: (stats) => stats.tasksCompleted >= 20,
  },

  // Suggestions
  {
    id: 'first-suggestion',
    title: 'Smart Start',
    description: 'Accept your first smart suggestion',
    category: 'suggestions',
    xp: 20,
    icon: '💡',
    unlockCondition: (stats) => stats.suggestionsAccepted >= 1,
  },
  {
    id: 'suggestion-fan',
    title: 'Suggestion Fan',
    description: 'Accept 10 smart suggestions',
    category: 'suggestions',
    xp: 50,
    icon: '💡💡',
    unlockCondition: (stats) => stats.suggestionsAccepted >= 10,
  },
  {
    id: 'suggestion-addict',
    title: 'Suggestion Addict',
    description: 'Accept 50 smart suggestions',
    category: 'suggestions',
    xp: 150,
    icon: '💡💡💡',
    unlockCondition: (stats) => stats.suggestionsAccepted >= 50,
  },

  // Explain Mode
  {
    id: 'curious-mind',
    title: 'Curious Mind',
    description: 'Use Explain Mode for the first time',
    category: 'explain',
    xp: 20,
    icon: '🔍',
    unlockCondition: (stats) => stats.explainModeUsed >= 1,
  },
  {
    id: 'knowledge-seeker',
    title: 'Knowledge Seeker',
    description: 'Use Explain Mode 10 times',
    category: 'explain',
    xp: 50,
    icon: '🔍🔍',
    unlockCondition: (stats) => stats.explainModeUsed >= 10,
  },
  {
    id: 'understanding-master',
    title: 'Understanding Master',
    description: 'Use Explain Mode 50 times',
    category: 'explain',
    xp: 150,
    icon: '🔍🔍🔍',
    unlockCondition: (stats) => stats.explainModeUsed >= 50,
  },

  // Tutorials
  {
    id: 'tutorial-starter',
    title: 'Tutorial Starter',
    description: 'Complete your first tutorial',
    category: 'tutorials',
    xp: 30,
    icon: '📚',
    unlockCondition: (stats) => stats.tutorialsCompleted >= 1,
  },
  {
    id: 'eager-learner',
    title: 'Eager Learner',
    description: 'Complete 3 tutorials',
    category: 'tutorials',
    xp: 75,
    icon: '📚📚',
    unlockCondition: (stats) => stats.tutorialsCompleted >= 3,
  },
  {
    id: 'tutorial-champion',
    title: 'Tutorial Champion',
    description: 'Complete 5 tutorials',
    category: 'tutorials',
    xp: 150,
    icon: '📚📚📚',
    unlockCondition: (stats) => stats.tutorialsCompleted >= 5,
  },
  {
    id: 'tutorial-completionist',
    title: 'Tutorial Completionist',
    description: 'Complete all 10 tutorials',
    category: 'tutorials',
    xp: 300,
    icon: '🏆',
    unlockCondition: (stats) => stats.tutorialsCompleted >= 10,
  },

  // Workflows
  {
    id: 'workflow-novice',
    title: 'Workflow Novice',
    description: 'Execute your first workflow',
    category: 'workflows',
    xp: 30,
    icon: '⚙️',
    unlockCondition: (stats) => stats.workflowsExecuted >= 1,
  },
  {
    id: 'workflow-user',
    title: 'Workflow User',
    description: 'Execute 5 workflows',
    category: 'workflows',
    xp: 75,
    icon: '⚙️⚙️',
    unlockCondition: (stats) => stats.workflowsExecuted >= 5,
  },
  {
    id: 'workflow-expert',
    title: 'Workflow Expert',
    description: 'Execute 10 workflows',
    category: 'workflows',
    xp: 150,
    icon: '⚙️⚙️⚙️',
    unlockCondition: (stats) => stats.workflowsExecuted >= 10,
  },
  {
    id: 'automation-master',
    title: 'Automation Master',
    description: 'Execute 25 workflows',
    category: 'workflows',
    xp: 300,
    icon: '🤖',
    unlockCondition: (stats) => stats.workflowsExecuted >= 25,
  },

  // Productivity
  {
    id: 'productive',
    title: 'Productive',
    description: 'Execute 50 commands',
    category: 'mastery',
    xp: 100,
    icon: '⚡',
    unlockCondition: (stats) => stats.commandsExecuted >= 50,
  },
  {
    id: 'power-user',
    title: 'Power User',
    description: 'Execute 100 commands',
    category: 'mastery',
    xp: 200,
    icon: '⚡⚡',
    unlockCondition: (stats) => stats.commandsExecuted >= 100,
  },
  {
    id: 'creator',
    title: 'Creator',
    description: 'Create 25 files',
    category: 'mastery',
    xp: 100,
    icon: '📝',
    unlockCondition: (stats) => stats.filesCreated >= 25,
  },
  {
    id: 'prolific-creator',
    title: 'Prolific Creator',
    description: 'Create 100 files',
    category: 'mastery',
    xp: 300,
    icon: '📝📝',
    unlockCondition: (stats) => stats.filesCreated >= 100,
  },

  // Mastery
  {
    id: 'well-rounded',
    title: 'Well-Rounded',
    description: 'Use all major features at least once',
    category: 'mastery',
    xp: 200,
    icon: '🌟',
    unlockCondition: (stats) =>
      stats.wizardCompleted &&
      stats.tasksCompleted >= 1 &&
      stats.tutorialsCompleted >= 1 &&
      stats.workflowsExecuted >= 1 &&
      stats.suggestionsAccepted >= 1 &&
      stats.explainModeUsed >= 1,
  },
  {
    id: 'achievement-hunter',
    title: 'Achievement Hunter',
    description: 'Unlock 10 achievements',
    category: 'mastery',
    xp: 150,
    icon: '🎯',
    unlockCondition: (stats) => stats.achievementsUnlocked.length >= 10,
  },
  {
    id: 'completionist',
    title: 'Completionist',
    description: 'Unlock 20 achievements',
    category: 'mastery',
    xp: 500,
    icon: '🏆',
    unlockCondition: (stats) => stats.achievementsUnlocked.length >= 20,
  },
  {
    id: 'legend',
    title: 'Living Legend',
    description: 'Reach level 10',
    category: 'mastery',
    xp: 1000,
    icon: '👑',
    unlockCondition: (stats) => stats.level >= 10,
    hidden: true,
  },
];
