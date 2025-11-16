/**
 * Copyright 2025 Google LLC
 */
import type { Example } from '../../types.js';
const example: Example = {
  id: 'automated-git-workflow',
  title: 'Automated Git Workflow',
  description: 'Run a complete git workflow: stage, commit, and push',
  category: 'automation',
  tags: ['git', 'automation', 'workflow'],
  difficulty: 'beginner',
  estimatedTime: '2 minutes',
  requiredTools: ['run_shell_command'],
  requiredPermissions: [],
  examplePrompt: 'Review my changes, generate a commit message, commit, and push to origin',
  expectedOutcome: 'Changes committed and pushed',
  tips: ['Review before pushing to main branch'],
  relatedExamples: ['generate-commit-message'],
  documentationLinks: ['/docs/examples/git-workflow.md'],
};
export default example;
