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

import type { Example } from '../../types.js';

/**
 * Example: Analyze CSV Data
 *
 * This example demonstrates how to load, analyze, and extract
 * insights from CSV data files.
 */
const example: Example = {
  id: 'analyze-csv-data',
  title: 'Analyze CSV Data and Generate Insights',
  description:
    'Load CSV files, analyze the data, calculate statistics, and generate actionable insights',
  category: 'data-analysis',
  tags: ['csv', 'data', 'statistics', 'insights', 'reporting'],
  difficulty: 'beginner',
  estimatedTime: '5-10 minutes',
  requiredTools: ['read_files'],
  requiredPermissions: ['file-read'],
  examplePrompt: `Analyze the data in @sales-data.csv and provide insights:

1. **Data Overview**: Show column names, data types, row count
2. **Summary Statistics**: Calculate mean, median, min, max for numeric columns
3. **Missing Data**: Identify any missing or invalid values
4. **Trends**: Identify patterns or trends in the data
5. **Outliers**: Flag unusual values that might need attention
6. **Key Insights**: Provide 3-5 actionable insights from the data

Present findings in a clear, business-friendly format.`,
  expectedOutcome:
    'Comprehensive data analysis with statistics, trends, and actionable insights',
  tips: [
    'Works with any tabular data format (CSV, TSV, Excel)',
    'Ask for specific analyses like correlations or predictions',
    'Request visualizations (Gemini will describe charts to create)',
    'Can compare multiple CSV files',
  ],
  relatedExamples: [
    'parse-logs',
    'extract-json',
    'combine-csvs',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/data-analysis.md',
  ],
  prerequisites: [
    'Have a CSV file to analyze in the current directory',
  ],
  featured: true,
};

export default example;
