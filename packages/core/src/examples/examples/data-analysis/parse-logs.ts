/**
 * Copyright 2025 Google LLC
 */
import type { Example } from '../../types.js';
const example: Example = {
  id: 'parse-log-files',
  title: 'Parse and Analyze Log Files',
  description: 'Extract errors, warnings, and patterns from log files',
  category: 'data-analysis',
  tags: ['logs', 'debugging', 'analysis'],
  difficulty: 'intermediate',
  estimatedTime: '3-5 minutes',
  requiredTools: ['read_files', 'grep_search'],
  requiredPermissions: [],
  examplePrompt: 'Analyze @application.log and summarize: 1) Error count by type, 2) Top error messages, 3) Time patterns, 4) Root causes',
  expectedOutcome: 'Structured analysis with insights',
  tips: ['Works with most log formats'],
  relatedExamples: ['find-errors'],
  documentationLinks: ['/docs/tools/grep.md'],
};
export default example;
