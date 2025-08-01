/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Test how paths are normalized
function testPathNormalization() {
  // Use platform-agnostic path construction instead of hardcoded paths
  const testPath = path.join('test', 'project', 'src', 'file.md');
  const absoluteTestPath = path.resolve('test', 'project', 'src', 'file.md');

  console.log('Testing path normalization:');
  console.log('Relative path:', testPath);
  console.log('Absolute path:', absoluteTestPath);

  // Test path.join with different segments
  const joinedPath = path.join('test', 'project', 'src', 'file.md');
  console.log('Joined path:', joinedPath);

  // Test path.normalize
  console.log('Normalized relative path:', path.normalize(testPath));
  console.log('Normalized absolute path:', path.normalize(absoluteTestPath));

  // Test how the test would see these paths
  const testContent = `--- File: ${absoluteTestPath} ---\nContent\n--- End of File: ${absoluteTestPath} ---`;
  console.log('\nTest content with platform-agnostic paths:');
  console.log(testContent);

  // Try to match with different patterns
  const marker = `--- File: ${absoluteTestPath} ---`;
  console.log('\nTrying to match:', marker);
  console.log('Direct match:', testContent.includes(marker));

  // Test with normalized path in marker
  const normalizedMarker = `--- File: ${path.normalize(absoluteTestPath)} ---`;
  console.log(
    'Normalized marker match:',
    testContent.includes(normalizedMarker),
  );

  // Test path resolution
  const __filename = fileURLToPath(import.meta.url);
  console.log('\nCurrent file path:', __filename);
  console.log('Directory name:', path.dirname(__filename));
}

testPathNormalization();
