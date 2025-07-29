/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Test how paths are normalized
function testPathNormalization() {
  const unixPath = '/test/project/src/file.md';
  const windowsPath = 'C:\\test\\project\\src\\file.md';

  console.log('Testing path normalization:');
  console.log('Unix path:', unixPath);
  console.log('Windows path:', windowsPath);

  // Test path.join
  const joinedPath = path.join('C:', 'test', 'project', 'src', 'file.md');
  console.log('Joined path:', joinedPath);

  // Test path.normalize
  console.log('Normalized Windows path:', path.normalize(windowsPath));
  console.log('Normalized Unix path:', path.normalize(unixPath));

  // Test how the test would see these paths
  const testContent = `--- File: ${windowsPath} ---\nContent\n--- End of File: ${windowsPath} ---`;
  console.log('\nTest content with Windows paths:');
  console.log(testContent);

  // Try to match with different patterns
  const marker = `--- File: ${windowsPath} ---`;
  console.log('\nTrying to match:', marker);
  console.log('Direct match:', testContent.includes(marker));

  // Test with normalized path in marker
  const normalizedMarker = `--- File: ${path.normalize(windowsPath)} ---`;
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
