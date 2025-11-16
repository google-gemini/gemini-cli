/**
 * Copyright 2025 Google LLC
 */
import type { Example } from '../../types.js';
const example: Example = {
  id: 'generate-readme',
  title: 'Generate README.md',
  description: 'Create a comprehensive README for your project',
  category: 'documentation',
  tags: ['documentation', 'readme', 'markdown'],
  difficulty: 'beginner',
  estimatedTime: '5 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-write'],
  examplePrompt: 'Analyze this project and generate a README.md with: title, description, installation, usage, features, contributing guidelines',
  expectedOutcome: 'Complete README.md file',
  tips: ['Review and customize for your project'],
  relatedExamples: ['generate-api-docs'],
  documentationLinks: ['/docs/examples/documentation.md'],
  featured: true,
};
export default example;
