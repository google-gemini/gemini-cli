/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from './types.js';
import { getLearningPath, ACHIEVEMENTS } from '@google/gemini-cli-core/learning-path';

export const learningPathCommand: SlashCommand = {
  name: 'progress',
  description: 'View learning path, achievements, and XP',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const learningPath = getLearningPath();

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommand = parts[0] || 'dashboard';

    switch (subcommand) {
      case 'dashboard':
      case 'status':
        return showDashboard(learningPath);

      case 'achievements':
        return showAchievements(learningPath, parts[1]);

      case 'stats':
        return showStats(learningPath);

      case 'leaderboard':
        return showLeaderboard(learningPath);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown command: ${subcommand}\n\nAvailable commands:\n  /progress dashboard       - Show learning dashboard\n  /progress achievements    - View all achievements\n  /progress stats           - Detailed statistics\n  /progress leaderboard     - XP and level info`,
        };
    }
  },
};

function showDashboard(learningPath: any): MessageActionReturn {
  const stats = learningPath.getStats();
  const currentLevel = learningPath.getLevel();
  const nextLevel = learningPath.getNextLevel();
  const progressToNext = learningPath.getProgressToNextLevel();
  const recentAchievements = learningPath.getRecentAchievements(3);

  let content = `🎮 **Learning Path Dashboard**\n\n**Level ${stats.level}: ${currentLevel.title}**\n${currentLevel.description}\n\nXP: ${stats.xp}`;

  if (nextLevel) {
    const xpNeeded = nextLevel.xpRequired - stats.xp;
    content += ` / ${nextLevel.xpRequired} (${Math.round(progressToNext)}%)\nNext level: ${nextLevel.title} (${xpNeeded} XP needed)`;
  } else {
    content += ' (MAX LEVEL!)';
  }

  content += `\n\n**Achievements:** ${stats.achievementsUnlocked.length}/${ACHIEVEMENTS.length}`;

  if (stats.streak > 0) {
    content += `\n🔥 **Streak:** ${stats.streak} day${stats.streak > 1 ? 's' : ''}`;
  }

  if (recentAchievements.length > 0) {
    const recent = recentAchievements
      .map((a: any) => `  ${a.icon} **${a.title}** (+${a.xp} XP)`)
      .join('\n');
    content += `\n\n**Recent Achievements:**\n${recent}`;
  }

  content += `\n\n_View all: /progress achievements_`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

function showAchievements(
  learningPath: any,
  category?: string,
): MessageActionReturn {
  const unlocked = learningPath.getUnlockedAchievements();
  const locked = learningPath.getLockedAchievements();

  let filtered = category
    ? ACHIEVEMENTS.filter((a: any) => a.category === category)
    : ACHIEVEMENTS;

  // Group by category
  const byCategory: Record<string, any[]> = {};
  filtered.forEach((a: any) => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  const categories = Object.keys(byCategory).sort();
  const sections = categories.map((cat) => {
    const items = byCategory[cat]
      .map((a: any) => {
        const isUnlocked = unlocked.some((u: any) => u.id === a.id);
        const icon = isUnlocked ? '✅' : '🔒';
        return `  ${icon} ${a.icon} **${a.title}** - ${a.description} (+${a.xp} XP)`;
      })
      .join('\n');
    return `**${cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}**\n${items}`;
  });

  const stats = learningPath.getStats();
  const percentage = Math.round(
    (stats.achievementsUnlocked.length / ACHIEVEMENTS.length) * 100,
  );

  return {
    type: 'message',
    messageType: 'info',
    content: `🏆 **Achievements** (${stats.achievementsUnlocked.length}/${ACHIEVEMENTS.length} - ${percentage}%)\n\n${sections.join('\n\n')}\n\n_Filter by category: /progress achievements <category>_`,
  };
}

function showStats(learningPath: any): MessageActionReturn {
  const stats = learningPath.getStats();
  const xpHistory = learningPath.getXPHistory(10);

  const recentXP = xpHistory
    .map(
      (gain: any) =>
        `  +${gain.amount} XP from ${gain.source} (${new Date(gain.timestamp).toLocaleString()})`,
    )
    .join('\n');

  return {
    type: 'message',
    messageType: 'info',
    content: `📊 **Detailed Statistics**\n\n**Activity:**\n  Wizard completed: ${stats.wizardCompleted ? 'Yes' : 'No'}\n  Tasks completed: ${stats.tasksCompleted}\n  Tutorials completed: ${stats.tutorialsCompleted}\n  Workflows executed: ${stats.workflowsExecuted}\n  Suggestions accepted: ${stats.suggestionsAccepted}\n  Explain mode used: ${stats.explainModeUsed}\n  Commands executed: ${stats.commandsExecuted}\n  Files created: ${stats.filesCreated}\n\n**Engagement:**\n  Days active: ${stats.daysActive}\n  Current streak: ${stats.streak} day${stats.streak !== 1 ? 's' : ''}\n  Total XP: ${stats.xp}\n  Level: ${stats.level}\n  Achievements: ${stats.achievementsUnlocked.length}\n\n**Recent XP Gains:**\n${recentXP || '  No recent activity'}`,
  };
}

function showLeaderboard(learningPath: any): MessageActionReturn {
  const stats = learningPath.getStats();
  const currentLevel = learningPath.getLevel();
  const nextLevel = learningPath.getNextLevel();

  // Calculate rank based on achievements
  const achievementPercentage =
    (stats.achievementsUnlocked.length / ACHIEVEMENTS.length) * 100;
  let rank = 'Novice';
  if (achievementPercentage >= 90) rank = 'Legend';
  else if (achievementPercentage >= 75) rank = 'Master';
  else if (achievementPercentage >= 50) rank = 'Expert';
  else if (achievementPercentage >= 25) rank = 'Advanced';

  let content = `👑 **Leaderboard & Rankings**\n\n**Your Rank:** ${rank}\n**Level:** ${stats.level} - ${currentLevel.title}\n**Total XP:** ${stats.xp}\n`;

  if (nextLevel) {
    const xpNeeded = nextLevel.xpRequired - stats.xp;
    const progress = learningPath.getProgressToNextLevel();
    content += `**Progress to ${nextLevel.title}:** ${Math.round(progress)}% (${xpNeeded} XP needed)\n`;
  }

  content += `\n**Achievement Score:** ${Math.round(achievementPercentage)}%\n**Streak Bonus:** ${stats.streak > 0 ? '🔥'.repeat(Math.min(stats.streak, 5)) : 'None'}\n\n_Keep progressing to climb the ranks!_`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}
