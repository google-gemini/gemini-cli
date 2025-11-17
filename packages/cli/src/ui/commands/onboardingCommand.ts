/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getChecklist } from '@google/gemini-cli-core/onboarding';

export const onboardingCommand: SlashCommand = {
  name: 'onboarding',
  description: 'View onboarding checklist and progress',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const checklist = getChecklist();

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'dashboard';

    switch (subcommand) {
      case 'dashboard':
      case 'status':
        return showDashboard(checklist);

      case 'start':
        return startTask(checklist, parts[1]);

      case 'complete':
        return completeTask(checklist, parts[1]);

      case 'skip':
        return skipTask(checklist, parts[1]);

      case 'stats':
        return showStats(checklist);

      case 'reset':
        return resetChecklist(checklist);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /onboarding dashboard - Show checklist\n  /onboarding stats     - Show statistics\n  /onboarding start <task-id>\n  /onboarding complete <task-id>\n  /onboarding skip <task-id>\n  /onboarding reset`,
        };
    }
  },
};

function showDashboard(checklist: any): MessageActionReturn {
  const state = checklist.getState();
  const stats = checklist.getStats();
  const recommendations = checklist.getNextRecommendations(3);

  const categoryProgress = Object.entries(stats.byCategory)
    .map(
      ([category, data]: [string, any]) =>
        `  ${category.padEnd(12)}: ${data.completed}/${data.total} completed`,
    )
    .join('\n');

  const nextSteps = recommendations
    .map(
      (rec: any, i: number) =>
        `${i + 1}. **${rec.task.title}**\n   ${rec.reason}\n   Estimated: ${rec.task.estimatedTime}${rec.task.command ? `\n   Try: ${rec.task.command}` : ''}`,
    )
    .join('\n\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📋 **Onboarding Checklist**\n\nProgress: ${state.progress}% (${stats.completedTasks}/${stats.totalTasks} tasks)\n\n**By Category:**\n${categoryProgress}\n\n**Next Recommended Steps:**\n${nextSteps || 'All done! 🎉'}\n\n_Run /onboarding stats for detailed statistics_`,
  };
}

function startTask(checklist: any, taskId: string): MessageActionReturn {
  if (!taskId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a task ID.\n\nExample: /onboarding start first-prompt',
    };
  }

  const task = checklist.getTask(taskId);
  if (!task) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Task not found: ${taskId}`,
    };
  }

  checklist.startTask(taskId);

  return {
    type: 'message',
    messageType: 'info',
    content: `▶️ **Started: ${task.title}**\n\n${task.description}\n\nEstimated time: ${task.estimatedTime}${task.helpText ? `\n\n💡 ${task.helpText}` : ''}${task.command ? `\n\nTry: ${task.command}` : ''}`,
  };
}

function completeTask(checklist: any, taskId: string): MessageActionReturn {
  if (!taskId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a task ID.\n\nExample: /onboarding complete first-prompt',
    };
  }

  const task = checklist.getTask(taskId);
  if (!task) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Task not found: ${taskId}`,
    };
  }

  checklist.completeTask(taskId);
  const state = checklist.getState();

  let celebration = '';
  if (state.isComplete) {
    celebration = '\n\n🎉 **Congratulations!** You have completed all essential onboarding tasks!';
  }

  return {
    type: 'message',
    messageType: 'info',
    content: `✅ **Completed: ${task.title}**\n\nProgress: ${state.progress}%${celebration}`,
  };
}

function skipTask(checklist: any, taskId: string): MessageActionReturn {
  if (!taskId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a task ID.\n\nExample: /onboarding skip advanced-tools',
    };
  }

  checklist.skipTask(taskId);

  return {
    type: 'message',
    messageType: 'info',
    content: `⏭️ Skipped task: ${taskId}`,
  };
}

function showStats(checklist: any): MessageActionReturn {
  const stats = checklist.getStats();

  const timeToFirst = stats.timeToFirstTask
    ? `${Math.round(stats.timeToFirstTask / 1000 / 60)} minutes`
    : 'N/A';

  const avgTime = stats.averageCompletionTime
    ? `${Math.round(stats.averageCompletionTime / 1000 / 60)} minutes`
    : 'N/A';

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Onboarding Statistics**\n\n**Overall:**\n  Total tasks: ${stats.totalTasks}\n  Completed: ${stats.completedTasks}\n  Completion rate: ${stats.completionRate.toFixed(1)}%\n\n**By Category:**\n  Essential: ${stats.byCategory.essential.completed}/${stats.byCategory.essential.total}\n  Core: ${stats.byCategory.core.completed}/${stats.byCategory.core.total}\n  Advanced: ${stats.byCategory.advanced.completed}/${stats.byCategory.advanced.total}\n\n**Timing:**\n  Time to first task: ${timeToFirst}\n  Average completion: ${avgTime}`,
  };
}

function resetChecklist(checklist: any): MessageActionReturn {
  checklist.reset();
  return {
    type: 'message',
    messageType: 'info',
    content: '🔄 Onboarding checklist has been reset.',
  };
}
