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
 * Example: Extract Data from JSON
 *
 * This example shows how to parse JSON files and extract
 * specific data based on complex queries.
 */
const example: Example = {
  id: 'extract-json-data',
  title: 'Extract Specific Data from JSON Files',
  description:
    'Parse JSON files, navigate complex structures, and extract specific data based on conditions',
  category: 'data-analysis',
  tags: ['json', 'parsing', 'extraction', 'filtering', 'transformation'],
  difficulty: 'intermediate',
  estimatedTime: '5-10 minutes',
  requiredTools: ['read_files', 'write_files'],
  requiredPermissions: ['file-read', 'file-write'],
  examplePrompt: `Extract data from @api-response.json:

1. **Parse JSON**: Read and parse the JSON structure
2. **Navigate Structure**: Find the relevant data nested in the structure
3. **Apply Filters**: Extract only items matching criteria (e.g., status: "active")
4. **Transform Data**: Convert to desired format (CSV, simplified JSON, etc.)
5. **Handle Errors**: Deal with missing fields or malformed data gracefully
6. **Save Output**: Write extracted data to a new file

Make the extraction robust and handle edge cases.`,
  expectedOutcome:
    'Extracted and transformed data saved to a new file in the desired format',
  tips: [
    'Provide example of the data structure you want to extract',
    'Can combine multiple JSON files into one',
    'Ask for specific JSONPath or JQ-like queries',
    'Useful for API responses, config files, and data dumps',
  ],
  relatedExamples: [
    'analyze-csv-data',
    'parse-logs',
    'combine-csvs',
  ],
  documentationLinks: [
    '/docs/tools/file-system.md',
    '/docs/examples/json-processing.md',
  ],
  prerequisites: [
    'Have JSON files to process in the current directory',
  ],
  featured: false,
};

export default example;
