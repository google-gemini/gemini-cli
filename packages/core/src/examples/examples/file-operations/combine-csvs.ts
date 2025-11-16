/**
 * Copyright 2025 Google LLC
 */
import type { Example } from '../../types.js';
const example: Example = {
  id: 'combine-csv-files',
  title: 'Combine Multiple CSV Files',
  description: 'Merge multiple CSV files with the same structure into one',
  category: 'file-operations',
  tags: ['csv', 'data', 'merge'],
  difficulty: 'beginner',
  estimatedTime: '2 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-write'],
  examplePrompt: 'Combine all CSV files in ./data/ into one merged.csv file. Keep headers from first file only.',
  expectedOutcome: 'Single merged CSV file',
  tips: ['Ensure all CSVs have the same column structure'],
  relatedExamples: ['convert-csv-to-json'],
  documentationLinks: ['/docs/tools/file-system.md'],
};
export default example;
