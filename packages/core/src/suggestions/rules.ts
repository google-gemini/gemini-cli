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
 * Default Suggestion Rules
 *
 * Pre-defined rules for generating context-aware suggestions
 *
 * @module suggestions/rules
 */

import type { SuggestionRule } from './types.js';

export const DEFAULT_RULES: SuggestionRule[] = [
  // Git-based suggestions
  {
    id: 'git-uncommitted-changes',
    name: 'Suggest commit when there are uncommitted changes',
    priority: 8,
    enabled: true,
    condition: (ctx) => ctx.git?.hasChanges === true,
    generate: (ctx) => [
      {
        id: 'git-commit',
        text: 'Commit your changes',
        description: 'You have uncommitted changes. Consider committing them.',
        category: 'contextual',
        score: 0.8,
        reason: `Untracked files: ${ctx.git?.untrackedFiles || 0}`,
        example: 'git add . && git commit -m "Your message"',
        source: 'git-detector',
      },
    ],
  },

  {
    id: 'git-conflicts',
    name: 'Suggest conflict resolution',
    priority: 10,
    enabled: true,
    condition: (ctx) => ctx.git?.hasConflicts === true,
    generate: () => [
      {
        id: 'resolve-conflicts',
        text: 'Resolve merge conflicts',
        description: 'You have merge conflicts that need resolution',
        category: 'contextual',
        score: 0.95,
        reason: 'Conflicts detected in working directory',
        example: 'Review conflicted files and resolve markers',
        source: 'git-detector',
      },
    ],
  },

  // Project type suggestions
  {
    id: 'nodejs-package-install',
    name: 'Suggest npm install for Node.js projects',
    priority: 7,
    enabled: true,
    condition: (ctx) =>
      ctx.projectType === 'nodejs' || ctx.projectType === 'typescript',
    generate: () => [
      {
        id: 'npm-install',
        text: 'Install dependencies',
        description: 'Install Node.js dependencies',
        category: 'command',
        score: 0.7,
        example: 'npm install',
        source: 'project-detector',
      },
    ],
  },

  {
    id: 'python-venv',
    name: 'Suggest virtual environment for Python',
    priority: 7,
    enabled: true,
    condition: (ctx) => ctx.projectType === 'python',
    generate: () => [
      {
        id: 'python-venv',
        text: 'Create virtual environment',
        description: 'Set up Python virtual environment',
        category: 'command',
        score: 0.7,
        example: 'python -m venv venv',
        source: 'project-detector',
      },
    ],
  },

  {
    id: 'react-dev-server',
    name: 'Suggest starting React dev server',
    priority: 6,
    enabled: true,
    condition: (ctx) => ctx.projectType === 'react',
    generate: () => [
      {
        id: 'react-start',
        text: 'Start development server',
        description: 'Run React development server',
        category: 'command',
        score: 0.75,
        example: 'npm start',
        source: 'project-detector',
      },
    ],
  },

  // Command patterns
  {
    id: 'first-time-user',
    name: 'Welcome suggestions for new users',
    priority: 9,
    enabled: true,
    condition: (ctx) => !ctx.recentCommands || ctx.recentCommands.length === 0,
    generate: () => [
      {
        id: 'try-examples',
        text: 'Browse example library',
        description: 'Explore what Gemini CLI can do',
        category: 'example',
        score: 0.85,
        example: '/examples',
        source: 'pattern-matcher',
      },
      {
        id: 'start-wizard',
        text: 'Run setup wizard',
        description: 'Configure Gemini CLI for your needs',
        category: 'command',
        score: 0.9,
        example: '/wizard start',
        source: 'pattern-matcher',
      },
      {
        id: 'view-onboarding',
        text: 'View onboarding checklist',
        description: 'Learn Gemini CLI through guided tasks',
        category: 'command',
        score: 0.88,
        example: '/onboarding',
        source: 'pattern-matcher',
      },
    ],
  },

  // File-based suggestions
  {
    id: 'recent-files',
    name: 'Suggest operations on recent files',
    priority: 6,
    enabled: true,
    condition: (ctx) => (ctx.recentFiles?.length || 0) > 0,
    generate: (ctx) => {
      const recentFile = ctx.recentFiles?.[0];
      if (!recentFile) return [];

      return [
        {
          id: 'analyze-file',
          text: `Analyze ${recentFile}`,
          description: 'Get insights about this file',
          category: 'prompt',
          score: 0.65,
          example: `Explain what this file does`,
          source: 'file-detector',
        },
      ];
    },
  },

  // Repetitive command detection
  {
    id: 'repetitive-command',
    name: 'Suggest saving repetitive commands',
    priority: 7,
    enabled: true,
    condition: (ctx) => {
      if (!ctx.recentCommands || ctx.recentCommands.length < 3) return false;
      const first = ctx.recentCommands[0];
      const repeats = ctx.recentCommands.filter((c) => c === first).length;
      return repeats >= 3;
    },
    generate: (ctx) => [
      {
        id: 'save-command',
        text: 'Save this as a custom command',
        description: 'You have run this command multiple times',
        category: 'workflow',
        score: 0.8,
        reason: `Command "${ctx.recentCommands?.[0]}" used ${ctx.recentCommands?.filter((c) => c === ctx.recentCommands?.[0]).length} times`,
        example: '/examples save my-command',
        source: 'pattern-matcher',
      },
    ],
  },
];
