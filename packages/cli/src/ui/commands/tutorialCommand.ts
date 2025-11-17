/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getTutorialEngine } from '@google/gemini-cli-core/tutorials';

export const tutorialCommand: SlashCommand = {
  name: 'tutorial',
  description: 'Interactive tutorials for learning Gemini CLI',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const engine = getTutorialEngine();

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        return listTutorials(engine);

      case 'start':
        return startTutorial(engine, parts[1]);

      case 'progress':
        return showProgress(engine, parts[1]);

      case 'next':
        return nextStep(engine, parts[1]);

      case 'previous':
        return previousStep(engine, parts[1]);

      case 'complete':
        return completeStep(engine, parts[1], parts.slice(2).join(' '));

      case 'stats':
        return showStats(engine);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /tutorial list              - List all tutorials\n  /tutorial start <id>        - Start a tutorial\n  /tutorial progress <id>     - Show tutorial progress\n  /tutorial next <id>         - Next step\n  /tutorial previous <id>     - Previous step\n  /tutorial complete <id>     - Complete current step\n  /tutorial stats             - Show learning statistics`,
        };
    }
  },
};

function listTutorials(engine: any): MessageActionReturn {
  const modules = engine.getModules();

  const byDifficulty = {
    beginner: modules.filter((m: any) => m.difficulty === 'beginner'),
    intermediate: modules.filter((m: any) => m.difficulty === 'intermediate'),
    advanced: modules.filter((m: any) => m.difficulty === 'advanced'),
  };

  const formatModules = (mods: any[]) =>
    mods
      .map(
        (m) =>
          `  • **${m.id}** - ${m.title}\n    ${m.description}\n    Time: ${m.estimatedTime}`,
      )
      .join('\n\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📚 **Available Tutorials**\n\n**Beginner**\n${formatModules(byDifficulty.beginner)}\n\n**Intermediate**\n${formatModules(byDifficulty.intermediate)}\n\n**Advanced**\n${formatModules(byDifficulty.advanced)}\n\n_Start a tutorial: /tutorial start <id>_`,
  };
}

function startTutorial(engine: any, moduleId: string): MessageActionReturn {
  if (!moduleId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tutorial ID.\n\nExample: /tutorial start getting-started',
    };
  }

  const module = engine.getModule(moduleId);
  if (!module) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Tutorial not found: ${moduleId}\n\nRun /tutorial list to see available tutorials.`,
    };
  }

  engine.startModule(moduleId);
  const progress = engine.getProgress(moduleId);
  const currentStep = module.steps[progress.currentStep];

  let content = `🎓 **${module.title}**\n\n${module.description}\n\n**Objectives:**\n${module.objectives.map((o: string) => `• ${o}`).join('\n')}\n\n**Estimated Time:** ${module.estimatedTime}\n`;

  if (module.prerequisites && module.prerequisites.length > 0) {
    content += `\n**Prerequisites:**\n${module.prerequisites.map((p: string) => `• ${p}`).join('\n')}\n`;
  }

  content += `\n---\n\n**Step 1/${module.steps.length}: ${currentStep.title}**\n\n${currentStep.content}`;

  if (currentStep.type === 'exercise' && currentStep.exercise) {
    content += `\n\n**Exercise:**\n${currentStep.exercise.task}`;
    if (currentStep.exercise.expectedOutput) {
      content += `\n\nExpected output:\n\`\`\`\n${currentStep.exercise.expectedOutput}\n\`\`\``;
    }
  } else if (currentStep.type === 'quiz' && currentStep.quiz) {
    content += `\n\n**Quiz:**\n${currentStep.quiz.question}\n\nOptions:\n${currentStep.quiz.options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`;
  }

  content += `\n\n_Next: /tutorial next ${moduleId}_`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function showProgress(engine: any, moduleId: string): MessageActionReturn {
  if (!moduleId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tutorial ID.\n\nExample: /tutorial progress getting-started',
    };
  }

  const progress = engine.getProgress(moduleId);
  if (!progress) {
    return {
      type: 'message',
      messageType: 'error',
      content: `No progress found for tutorial: ${moduleId}\n\nStart it first: /tutorial start ${moduleId}`,
    };
  }

  const module = engine.getModule(moduleId);
  const completedSteps = progress.completedSteps.length;
  const totalSteps = module.steps.length;
  const percentage = Math.round((completedSteps / totalSteps) * 100);

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Tutorial Progress: ${module.title}**\n\nCompleted: ${completedSteps}/${totalSteps} steps (${percentage}%)\nCurrent step: ${progress.currentStep + 1}\nTime spent: ${Math.round(progress.timeSpent / 60000)} minutes\n\n${progress.completed ? '✅ Tutorial completed!' : '_Continue: /tutorial next ' + moduleId + '_'}`,
  };
}

function nextStep(engine: any, moduleId: string): MessageActionReturn {
  if (!moduleId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tutorial ID.\n\nExample: /tutorial next getting-started',
    };
  }

  const module = engine.getModule(moduleId);
  const progress = engine.getProgress(moduleId);

  if (!progress) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Tutorial not started: ${moduleId}\n\nStart it first: /tutorial start ${moduleId}`,
    };
  }

  const newStepIndex = engine.nextStep(moduleId);

  if (newStepIndex >= module.steps.length) {
    return {
      type: 'message',
      messageType: 'success',
      content: `🎉 **Tutorial Completed: ${module.title}**\n\nGreat work! You've completed all ${module.steps.length} steps.\n\n_Check your progress: /tutorial stats_`,
    };
  }

  const currentStep = module.steps[newStepIndex];

  let content = `**Step ${newStepIndex + 1}/${module.steps.length}: ${currentStep.title}**\n\n${currentStep.content}`;

  if (currentStep.type === 'exercise' && currentStep.exercise) {
    content += `\n\n**Exercise:**\n${currentStep.exercise.task}`;
    if (currentStep.exercise.expectedOutput) {
      content += `\n\nExpected output:\n\`\`\`\n${currentStep.exercise.expectedOutput}\n\`\`\``;
    }
  } else if (currentStep.type === 'quiz' && currentStep.quiz) {
    content += `\n\n**Quiz:**\n${currentStep.quiz.question}\n\nOptions:\n${currentStep.quiz.options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`;
  }

  content += `\n\n_Next: /tutorial next ${moduleId}_`;
  if (newStepIndex > 0) {
    content += `\n_Previous: /tutorial previous ${moduleId}_`;
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function previousStep(engine: any, moduleId: string): MessageActionReturn {
  if (!moduleId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tutorial ID.\n\nExample: /tutorial previous getting-started',
    };
  }

  const module = engine.getModule(moduleId);
  const progress = engine.getProgress(moduleId);

  if (!progress) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Tutorial not started: ${moduleId}`,
    };
  }

  const newStepIndex = engine.previousStep(moduleId);
  const currentStep = module.steps[newStepIndex];

  let content = `**Step ${newStepIndex + 1}/${module.steps.length}: ${currentStep.title}**\n\n${currentStep.content}`;

  if (currentStep.type === 'exercise' && currentStep.exercise) {
    content += `\n\n**Exercise:**\n${currentStep.exercise.task}`;
  } else if (currentStep.type === 'quiz' && currentStep.quiz) {
    content += `\n\n**Quiz:**\n${currentStep.quiz.question}\n\nOptions:\n${currentStep.quiz.options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`;
  }

  content += `\n\n_Next: /tutorial next ${moduleId}_`;
  if (newStepIndex > 0) {
    content += `\n_Previous: /tutorial previous ${moduleId}_`;
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function completeStep(
  engine: any,
  moduleId: string,
  answer: string,
): MessageActionReturn {
  if (!moduleId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tutorial ID.',
    };
  }

  const progress = engine.getProgress(moduleId);
  if (!progress) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Tutorial not started: ${moduleId}`,
    };
  }

  engine.completeStep(moduleId, progress.currentStep);

  return {
    type: 'message',
    messageType: 'success',
    content: `✅ Step completed!\n\n_Continue: /tutorial next ${moduleId}_`,
  };
}

function showStats(engine: any): MessageActionReturn {
  const stats = engine.getStats();

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Tutorial Statistics**\n\nTotal tutorials: ${stats.totalModules}\nCompleted: ${stats.completedModules}\nIn progress: ${stats.inProgressModules}\nTotal time spent: ${Math.round(stats.totalTimeSpent / 60000)} minutes\n\n_View all tutorials: /tutorial list_`,
  };
}
