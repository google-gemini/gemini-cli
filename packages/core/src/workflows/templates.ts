/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Workflow } from './types.js';

export const BUILTIN_WORKFLOWS: Workflow[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review code changes and provide feedback',
    version: '1.0.0',
    category: 'development',
    tags: ['code', 'review'],
    steps: [
      { id: 'analyze', type: 'prompt', name: 'Analyze changes', prompt: 'Review the code changes and provide feedback' },
    ],
  },
  {
    id: 'bug-fix',
    name: 'Bug Fix Assistant',
    description: 'Help diagnose and fix bugs',
    version: '1.0.0',
    category: 'development',
    steps: [
      { id: 'diagnose', type: 'prompt', name: 'Diagnose issue', prompt: 'Analyze the bug and suggest fixes' },
    ],
  },
  {
    id: 'test-generation',
    name: 'Generate Tests',
    description: 'Create unit tests for code',
    version: '1.0.0',
    category: 'testing',
    steps: [
      { id: 'generate', type: 'prompt', name: 'Generate tests', prompt: 'Generate comprehensive unit tests' },
    ],
  },
  {
    id: 'doc-generation',
    name: 'Documentation Generator',
    description: 'Generate documentation for code',
    version: '1.0.0',
    category: 'documentation',
    steps: [
      { id: 'doc', type: 'prompt', name: 'Generate docs', prompt: 'Create documentation' },
    ],
  },
  {
    id: 'refactor',
    name: 'Code Refactoring',
    description: 'Refactor code for better quality',
    version: '1.0.0',
    category: 'development',
    steps: [
      { id: 'refactor', type: 'prompt', name: 'Refactor code', prompt: 'Refactor for better readability and performance' },
    ],
  },
  {
    id: 'api-design',
    name: 'API Design',
    description: 'Design REST API endpoints',
    version: '1.0.0',
    category: 'architecture',
    steps: [
      { id: 'design', type: 'prompt', name: 'Design API', prompt: 'Design REST API structure' },
    ],
  },
  {
    id: 'db-schema',
    name: 'Database Schema',
    description: 'Design database schema',
    version: '1.0.0',
    category: 'database',
    steps: [
      { id: 'schema', type: 'prompt', name: 'Design schema', prompt: 'Create database schema' },
    ],
  },
  {
    id: 'security-audit',
    name: 'Security Audit',
    description: 'Audit code for security issues',
    version: '1.0.0',
    category: 'security',
    steps: [
      { id: 'audit', type: 'prompt', name: 'Security scan', prompt: 'Check for security vulnerabilities' },
    ],
  },
  {
    id: 'performance-analysis',
    name: 'Performance Analysis',
    description: 'Analyze code performance',
    version: '1.0.0',
    category: 'optimization',
    steps: [
      { id: 'analyze', type: 'prompt', name: 'Analyze performance', prompt: 'Identify performance bottlenecks' },
    ],
  },
  {
    id: 'migration-helper',
    name: 'Migration Helper',
    description: 'Help migrate code to new version',
    version: '1.0.0',
    category: 'migration',
    steps: [
      { id: 'migrate', type: 'prompt', name: 'Plan migration', prompt: 'Create migration plan' },
    ],
  },
  {
    id: 'ci-setup',
    name: 'CI/CD Setup',
    description: 'Set up continuous integration',
    version: '1.0.0',
    category: 'devops',
    steps: [
      { id: 'setup', type: 'prompt', name: 'Configure CI', prompt: 'Create CI/CD configuration' },
    ],
  },
  {
    id: 'docker-setup',
    name: 'Docker Setup',
    description: 'Create Docker configuration',
    version: '1.0.0',
    category: 'devops',
    steps: [
      { id: 'docker', type: 'prompt', name: 'Create Dockerfile', prompt: 'Generate Docker configuration' },
    ],
  },
  {
    id: 'git-workflow',
    name: 'Git Workflow',
    description: 'Automate git operations',
    version: '1.0.0',
    category: 'git',
    steps: [
      { id: 'commit', type: 'shell', name: 'Git commit', command: 'git add . && git commit -m "{{message}}"' },
    ],
  },
  {
    id: 'dependency-update',
    name: 'Update Dependencies',
    description: 'Update project dependencies',
    version: '1.0.0',
    category: 'maintenance',
    steps: [
      { id: 'update', type: 'shell', name: 'Update deps', command: 'npm update' },
    ],
  },
  {
    id: 'project-init',
    name: 'Initialize Project',
    description: 'Set up new project structure',
    version: '1.0.0',
    category: 'setup',
    steps: [
      { id: 'init', type: 'prompt', name: 'Create structure', prompt: 'Set up project structure' },
    ],
  },
  {
    id: 'readme-gen',
    name: 'README Generator',
    description: 'Generate README file',
    version: '1.0.0',
    category: 'documentation',
    steps: [
      { id: 'readme', type: 'prompt', name: 'Create README', prompt: 'Generate comprehensive README' },
    ],
  },
  {
    id: 'changelog-update',
    name: 'Update Changelog',
    description: 'Update CHANGELOG file',
    version: '1.0.0',
    category: 'documentation',
    steps: [
      { id: 'changelog', type: 'prompt', name: 'Update changelog', prompt: 'Update CHANGELOG with recent changes' },
    ],
  },
  {
    id: 'error-handling',
    name: 'Add Error Handling',
    description: 'Improve error handling in code',
    version: '1.0.0',
    category: 'development',
    steps: [
      { id: 'errors', type: 'prompt', name: 'Add error handling', prompt: 'Add comprehensive error handling' },
    ],
  },
  {
    id: 'accessibility-audit',
    name: 'Accessibility Audit',
    description: 'Check accessibility compliance',
    version: '1.0.0',
    category: 'quality',
    steps: [
      { id: 'a11y', type: 'prompt', name: 'Check accessibility', prompt: 'Audit for accessibility issues' },
    ],
  },
  {
    id: 'type-safety',
    name: 'Add Type Safety',
    description: 'Add TypeScript types',
    version: '1.0.0',
    category: 'development',
    steps: [
      { id: 'types', type: 'prompt', name: 'Add types', prompt: 'Add TypeScript type definitions' },
    ],
  },
];
