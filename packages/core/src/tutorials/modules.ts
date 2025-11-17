/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TutorialModule } from './types.js';

export const TUTORIAL_MODULES: TutorialModule[] = [
  {
    id: 'getting-started',
    title: 'Getting Started with Gemini CLI',
    description: 'Learn the basics of using Gemini CLI',
    difficulty: 'beginner',
    estimatedTime: '15 minutes',
    objectives: [
      'Understand how to interact with Gemini',
      'Learn basic command syntax',
      'Complete your first task',
    ],
    steps: [
      {
        id: 'intro',
        type: 'instruction',
        title: 'Welcome to Gemini CLI',
        content: 'Gemini CLI is an AI-powered command-line tool that helps you with coding, analysis, and more. Type your questions or commands naturally.',
      },
      {
        id: 'first-prompt',
        type: 'exercise',
        title: 'Your First Prompt',
        content: 'Try asking Gemini a simple question.',
        hint: 'Try something like "What is Gemini CLI?"',
        exercise: {
          task: 'Ask Gemini any question',
          validation: async (input) => input.length > 0,
        },
      },
    ],
  },
  {
    id: 'file-operations',
    title: 'Working with Files',
    description: 'Learn how to reference and manipulate files',
    difficulty: 'beginner',
    estimatedTime: '20 minutes',
    prerequisites: ['getting-started'],
    objectives: [
      'Use @ syntax to reference files',
      'Read and analyze file contents',
      'Create and edit files',
    ],
    steps: [
      {
        id: 'file-ref',
        type: 'instruction',
        title: 'File References with @',
        content: 'Use @ followed by a file path to reference files. Example: "Explain @src/app.ts"',
      },
    ],
  },
  {
    id: 'slash-commands',
    title: 'Mastering Slash Commands',
    description: 'Learn about built-in slash commands',
    difficulty: 'beginner',
    estimatedTime: '15 minutes',
    objectives: [
      'Understand slash commands',
      'Use common commands',
      'Discover available commands',
    ],
    steps: [
      {
        id: 'intro-slash',
        type: 'instruction',
        title: 'What are Slash Commands?',
        content: 'Slash commands start with / and provide specific functionality. Try /help to see all commands.',
      },
    ],
  },
  {
    id: 'multimodal',
    title: 'Multimodal Prompts',
    description: 'Work with images and multiple file types',
    difficulty: 'intermediate',
    estimatedTime: '25 minutes',
    prerequisites: ['file-operations'],
    objectives: [
      'Reference images in prompts',
      'Analyze screenshots and diagrams',
      'Combine text and images',
    ],
    steps: [
      {
        id: 'image-ref',
        type: 'instruction',
        title: 'Referencing Images',
        content: 'Reference images using @ syntax just like code files. Gemini can analyze screenshots, diagrams, and more.',
      },
    ],
  },
  {
    id: 'tool-usage',
    title: 'Understanding Tools',
    description: 'Learn how Gemini uses tools to help you',
    difficulty: 'intermediate',
    estimatedTime: '30 minutes',
    objectives: [
      'Understand tool capabilities',
      'See tool usage with explain mode',
      'Work with shell commands',
    ],
    steps: [
      {
        id: 'tool-intro',
        type: 'instruction',
        title: 'What are Tools?',
        content: 'Gemini uses tools like read-file, write-file, and shell to accomplish tasks. Enable explain mode with /explain on to see tool usage.',
      },
    ],
  },
  {
    id: 'workflows-intro',
    title: 'Introduction to Workflows',
    description: 'Automate multi-step tasks with workflows',
    difficulty: 'intermediate',
    estimatedTime: '30 minutes',
    prerequisites: ['tool-usage'],
    objectives: [
      'Understand workflow concepts',
      'Run built-in workflows',
      'Create simple workflows',
    ],
    steps: [
      {
        id: 'workflow-concept',
        type: 'instruction',
        title: 'What are Workflows?',
        content: 'Workflows chain multiple steps together to automate complex tasks. Use /workflow list to see available workflows.',
      },
    ],
  },
  {
    id: 'advanced-prompting',
    title: 'Advanced Prompting Techniques',
    description: 'Write effective prompts for better results',
    difficulty: 'advanced',
    estimatedTime: '35 minutes',
    objectives: [
      'Structure complex prompts',
      'Provide context effectively',
      'Get precise results',
    ],
    steps: [
      {
        id: 'context',
        type: 'instruction',
        title: 'Providing Context',
        content: 'Good prompts include context about what you want to achieve. Be specific about your goals.',
      },
    ],
  },
  {
    id: 'project-analysis',
    title: 'Analyzing Projects',
    description: 'Understand codebases with Gemini',
    difficulty: 'advanced',
    estimatedTime: '40 minutes',
    prerequisites: ['file-operations', 'tool-usage'],
    objectives: [
      'Analyze project structure',
      'Find patterns and issues',
      'Generate documentation',
    ],
    steps: [
      {
        id: 'structure',
        type: 'instruction',
        title: 'Project Structure Analysis',
        content: 'Ask Gemini to analyze your project structure, identify patterns, or explain architecture.',
      },
    ],
  },
  {
    id: 'custom-commands',
    title: 'Creating Custom Commands',
    description: 'Save and reuse your prompts',
    difficulty: 'advanced',
    estimatedTime: '25 minutes',
    objectives: [
      'Save custom commands',
      'Use variables in commands',
      'Share commands with team',
    ],
    steps: [
      {
        id: 'save-command',
        type: 'instruction',
        title: 'Saving Commands',
        content: 'Use /examples save to save frequently used prompts as custom commands.',
      },
    ],
  },
  {
    id: 'best-practices',
    title: 'Best Practices and Tips',
    description: 'Master Gemini CLI workflows',
    difficulty: 'advanced',
    estimatedTime: '30 minutes',
    prerequisites: ['advanced-prompting', 'workflows-intro'],
    objectives: [
      'Follow security best practices',
      'Optimize performance',
      'Collaborate effectively',
    ],
    steps: [
      {
        id: 'security',
        type: 'instruction',
        title: 'Security Best Practices',
        content: 'Review generated code before executing, use appropriate permissions, and protect sensitive data.',
      },
    ],
  },
];
