/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getPlaygroundEngine } from '@google/gemini-cli-core/playground';

export const playgroundCommand: SlashCommand = {
  name: 'playground',
  description: 'Interactive coding challenges and practice sandbox',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const engine = getPlaygroundEngine();

    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'list';

    switch (subcommand) {
      case 'list':
        return listChallenges(engine, parts[1]);

      case 'show':
        return showChallenge(engine, parts[1]);

      case 'start':
        return startChallenge(engine, parts[1]);

      case 'submit':
        return submitSolution(engine, parts[1], parts.slice(2).join(' '));

      case 'hint':
        return showHint(engine, parts[1], parseInt(parts[2] || '0'));

      case 'solution':
        return showSolution(engine, parts[1]);

      case 'daily':
        return showDaily(engine);

      case 'stats':
        return showStats(engine);

      case 'progress':
        return showProgress(engine, parts[1]);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /playground list [difficulty]   - List challenges\n  /playground show <id>           - Show challenge details\n  /playground start <id>          - Start a challenge\n  /playground submit <id> <code>  - Submit solution\n  /playground hint <id> [index]   - Get a hint\n  /playground solution <id>       - View solution\n  /playground daily               - Show daily challenge\n  /playground stats               - Show statistics\n  /playground progress <id>       - Show challenge progress`,
        };
    }
  },
};

function listChallenges(engine: any, difficulty?: string): MessageActionReturn {
  let challenges;
  if (difficulty) {
    challenges = engine.getChallengesByDifficulty(difficulty);
    if (challenges.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: `No challenges found for difficulty: ${difficulty}\n\nValid difficulties: beginner, intermediate, advanced, expert`,
      };
    }
  } else {
    challenges = engine.getChallenges();
  }

  const byDifficulty: Record<string, any[]> = {
    beginner: [],
    intermediate: [],
    advanced: [],
    expert: [],
  };

  challenges.forEach((c: any) => {
    byDifficulty[c.difficulty].push(c);
  });

  const sections = Object.entries(byDifficulty)
    .filter(([_, chs]) => chs.length > 0)
    .map(([diff, chs]) => {
      const title = diff.charAt(0).toUpperCase() + diff.slice(1);
      const list = chs
        .map(
          (c: any) =>
            `  ${engine.isCompleted(c.id) ? '✅' : '⭕'} **${c.id}** - ${c.title} (${c.points} pts, ${c.estimatedTime})`,
        )
        .join('\n');
      return `**${title}**\n${list}`;
    });

  return {
    type: 'message',
    messageType: 'info',
    content: `🎮 **Coding Challenges** (${challenges.length})\n\n${sections.join('\n\n')}\n\n_Start: /playground start <id>_`,
  };
}

function showChallenge(engine: any, challengeId: string): MessageActionReturn {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.\n\nExample: /playground show basic-hello',
    };
  }

  const challenge = engine.getChallenge(challengeId);
  if (!challenge) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Challenge not found: ${challengeId}\n\nRun /playground list to see available challenges.`,
    };
  }

  const progress = engine.getProgress(challengeId);
  const statusIcon = progress?.completed ? '✅' : '⭕';

  let content = `${statusIcon} **${challenge.title}**\n\n${challenge.description}\n\n**Details:**\n- Difficulty: ${challenge.difficulty}\n- Points: ${challenge.points}\n- Estimated time: ${challenge.estimatedTime}\n- Category: ${challenge.category}\n`;

  if (challenge.prerequisites && challenge.prerequisites.length > 0) {
    content += `- Prerequisites: ${challenge.prerequisites.join(', ')}\n`;
  }

  content += `\n**Test Cases:** ${challenge.testCases.length}\n`;

  if (progress) {
    content += `\n**Your Progress:**\n- Attempts: ${progress.attempts}\n- Best score: ${progress.bestScore}\n- Hints used: ${progress.hintsUsed}/${challenge.hints.length}\n`;
  }

  content += `\n_Start: /playground start ${challengeId}_`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function startChallenge(engine: any, challengeId: string): MessageActionReturn {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.\n\nExample: /playground start basic-hello',
    };
  }

  const challenge = engine.getChallenge(challengeId);
  if (!challenge) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Challenge not found: ${challengeId}`,
    };
  }

  engine.startChallenge(challengeId);

  return {
    type: 'message',
    messageType: 'success',
    content: `🎯 **Started: ${challenge.title}**\n\n${challenge.description}\n\n**Goal:** ${challenge.testCases.length} test cases to pass\n**Points:** ${challenge.points}\n**Hints available:** ${challenge.hints.length}\n\n_Submit your solution: /playground submit ${challengeId} <code>_\n_Need a hint?: /playground hint ${challengeId}_`,
  };
}

async function submitSolution(
  engine: any,
  challengeId: string,
  code: string,
): Promise<MessageActionReturn> {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.',
    };
  }

  if (!code) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please provide your solution code.',
    };
  }

  try {
    const attempt = await engine.submitSolution(challengeId, code);
    const passedTests = attempt.testResults.filter((r: any) => r.passed).length;
    const totalTests = attempt.testResults.length;

    if (attempt.passed) {
      const progress = engine.getProgress(challengeId);
      return {
        type: 'message',
        messageType: 'success',
        content: `🎉 **Challenge Passed!**\n\nTests: ${passedTests}/${totalTests} ✅\nScore: ${progress.bestScore} points\n\n${progress.attempts === 1 ? '💪 **First try bonus!**\n' : ''}_Try another: /playground list_`,
      };
    } else {
      const failed = attempt.testResults.filter((r: any) => !r.passed);
      const failureDetails = failed
        .slice(0, 3)
        .map(
          (r: any) =>
            `- ${r.testName}: Expected "${r.expectedOutput}", got "${r.actualOutput}"${r.error ? ` (${r.error})` : ''}`,
        )
        .join('\n');

      return {
        type: 'message',
        messageType: 'error',
        content: `❌ **Tests Failed**\n\nPassed: ${passedTests}/${totalTests}\n\n${failureDetails}\n\n_Need help?: /playground hint ${challengeId}_`,
      };
    }
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to submit solution: ${error.message}`,
    };
  }
}

function showHint(
  engine: any,
  challengeId: string,
  hintIndex: number,
): MessageActionReturn {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.',
    };
  }

  try {
    const challenge = engine.getChallenge(challengeId);
    if (!challenge) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Challenge not found: ${challengeId}`,
      };
    }

    const hint = engine.useHint(challengeId, hintIndex);

    return {
      type: 'message',
      messageType: 'info',
      content: `💡 **Hint ${hintIndex + 1}/${challenge.hints.length}**\n\n${hint}\n\n${hintIndex + 1 < challenge.hints.length ? `_Next hint: /playground hint ${challengeId} ${hintIndex + 1}_` : ''}`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function showSolution(engine: any, challengeId: string): MessageActionReturn {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.',
    };
  }

  try {
    const { solution, explanation } = engine.viewSolution(challengeId);

    return {
      type: 'message',
      messageType: 'info',
      content: `🔑 **Solution**\n\n\`\`\`\n${solution}\n\`\`\`\n\n**Explanation:**\n${explanation}\n\n⚠️ _Viewing the solution will reduce your score by 50%_`,
    };
  } catch (error: any) {
    return {
      type: 'message',
      messageType: 'error',
      content: error.message,
    };
  }
}

function showDaily(engine: any): MessageActionReturn {
  const daily = engine.getDailyChallenge();
  const challenge = engine.getChallenge(daily.challengeId);

  if (!challenge) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Failed to load daily challenge.',
    };
  }

  return {
    type: 'message',
    messageType: 'info',
    content: `📅 **Daily Challenge** (${daily.date})\n\n${daily.completed ? '✅ ' : ''}**${challenge.title}**\n${challenge.description}\n\n**Bonus:** +${daily.bonus} points\n**Difficulty:** ${challenge.difficulty}\n**Time:** ${challenge.estimatedTime}\n\n${daily.completed ? '🎉 Already completed today!' : `_Start: /playground start ${challenge.id}_`}`,
  };
}

function showStats(engine: any): MessageActionReturn {
  const stats = engine.getStats();

  const categoryList = Object.entries(stats.challengesByCategory)
    .map(([cat, data]: [string, any]) => `  ${cat}: ${data.completed}/${data.total}`)
    .join('\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Playground Statistics**\n\n**Progress:**\n- Completed: ${stats.completedChallenges}/${stats.totalChallenges} (${Math.round(stats.completionRate)}%)\n- Points: ${stats.totalPoints}/${stats.maxPoints}\n- Average attempts: ${stats.averageAttempts.toFixed(1)}\n- Time spent: ${Math.round(stats.totalTimeSpent / 60000)} minutes\n\n**By Difficulty:**\n- Beginner: ${stats.challengesByDifficulty.beginner.completed}/${stats.challengesByDifficulty.beginner.total}\n- Intermediate: ${stats.challengesByDifficulty.intermediate.completed}/${stats.challengesByDifficulty.intermediate.total}\n- Advanced: ${stats.challengesByDifficulty.advanced.completed}/${stats.challengesByDifficulty.advanced.total}\n- Expert: ${stats.challengesByDifficulty.expert.completed}/${stats.challengesByDifficulty.expert.total}\n\n**By Category:**\n${categoryList}`,
  };
}

function showProgress(engine: any, challengeId: string): MessageActionReturn {
  if (!challengeId) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a challenge ID.',
    };
  }

  const progress = engine.getProgress(challengeId);
  if (!progress) {
    return {
      type: 'message',
      messageType: 'error',
      content: `No progress found for: ${challengeId}\n\nStart it first: /playground start ${challengeId}`,
    };
  }

  const challenge = engine.getChallenge(challengeId);
  if (!challenge) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Challenge not found: ${challengeId}`,
    };
  }

  return {
    type: 'message',
    messageType: 'info',
    content: `📈 **Progress: ${challenge.title}**\n\n${progress.completed ? '✅ Completed\n' : '⭕ In Progress\n'}\n**Attempts:** ${progress.attempts}\n**Best Score:** ${progress.bestScore}/${challenge.points}\n**Hints Used:** ${progress.hintsUsed}/${challenge.hints.length}\n**Solution Viewed:** ${progress.solutionViewed ? 'Yes (50% penalty)' : 'No'}\n${progress.firstCompletedAt ? `**Completed:** ${new Date(progress.firstCompletedAt).toLocaleString()}` : ''}`,
  };
}
