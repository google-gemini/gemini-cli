/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { loadServerHierarchicalMemory } from './memoryDiscovery.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { processImports } from './memoryImportProcessor.js';

// Helper to create test content
function createTestContent(index: number): string {
  return `# GEMINI Configuration ${index}

## Project Instructions
This is test content for performance benchmarking.
The content should be substantial enough to simulate real-world usage.

### Code Style Guidelines
- Use TypeScript for type safety
- Follow functional programming patterns
- Maintain high test coverage
- Keep functions pure when possible

### Architecture Principles
- Modular design with clear boundaries
- Clean separation of concerns
- Efficient resource usage
- Scalable and maintainable codebase

### Development Guidelines
Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
`.repeat(3); // Make content substantial
}

// Sequential implementation for comparison
async function readFilesSequential(
  filePaths: string[],
): Promise<Array<{ path: string; content: string | null }>> {
  const results = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const processedResult = await processImports(
        content,
        path.dirname(filePath),
        false,
        undefined,
        undefined,
        'flat',
      );
      results.push({ path: filePath, content: processedResult.content });
    } catch {
      results.push({ path: filePath, content: null });
    }
  }
  return results;
}

// Parallel implementation
async function readFilesParallel(
  filePaths: string[],
): Promise<Array<{ path: string; content: string | null }>> {
  const promises = filePaths.map(async (filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const processedResult = await processImports(
        content,
        path.dirname(filePath),
        false,
        undefined,
        undefined,
        'flat',
      );
      return { path: filePath, content: processedResult.content };
    } catch {
      return { path: filePath, content: null };
    }
  });
  return Promise.all(promises);
}

describe('memoryDiscovery performance', () => {
  let testDir: string;
  let fileService: FileDiscoveryService;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `memoryDiscovery-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    fileService = new FileDiscoveryService(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should demonstrate significant performance improvement with parallel processing', async () => {
    // Create test structure
    const numFiles = 20;
    const filePaths: string[] = [];

    for (let i = 0; i < numFiles; i++) {
      const dirPath = path.join(testDir, `project-${i}`);
      await fs.mkdir(dirPath, { recursive: true });

      const filePath = path.join(dirPath, 'GEMINI.md');
      await fs.writeFile(filePath, createTestContent(i));
      filePaths.push(filePath);
    }

    // Measure sequential processing
    const seqStart = performance.now();
    const seqResults = await readFilesSequential(filePaths);
    const seqTime = performance.now() - seqStart;

    // Measure parallel processing
    const parStart = performance.now();
    const parResults = await readFilesParallel(filePaths);
    const parTime = performance.now() - parStart;

    // Verify results are equivalent
    expect(seqResults.length).toBe(parResults.length);
    expect(seqResults.length).toBe(numFiles);

    // Verify parallel is faster
    expect(parTime).toBeLessThan(seqTime);

    // Calculate improvement
    const improvement = ((seqTime - parTime) / seqTime) * 100;
    const speedup = seqTime / parTime;

    // Log results for visibility
    console.log(`\n  Performance Results (${numFiles} files):`);
    console.log(`    Sequential: ${seqTime.toFixed(2)}ms`);
    console.log(`    Parallel:   ${parTime.toFixed(2)}ms`);
    console.log(`    Improvement: ${improvement.toFixed(1)}%`);
    console.log(`    Speedup: ${speedup.toFixed(2)}x\n`);

    // Expect significant improvement
    expect(improvement).toBeGreaterThan(50); // At least 50% improvement
  });

  it('should handle the actual loadServerHierarchicalMemory function efficiently', async () => {
    // Create multiple directories with GEMINI.md files
    const dirs: string[] = [];
    const numDirs = 10;

    for (let i = 0; i < numDirs; i++) {
      const dirPath = path.join(testDir, `workspace-${i}`);
      await fs.mkdir(dirPath, { recursive: true });
      dirs.push(dirPath);

      // Create GEMINI.md file
      const content = createTestContent(i);
      await fs.writeFile(path.join(dirPath, 'GEMINI.md'), content);

      // Create nested structure
      const nestedPath = path.join(dirPath, 'src', 'components');
      await fs.mkdir(nestedPath, { recursive: true });
      await fs.writeFile(path.join(nestedPath, 'GEMINI.md'), content);
    }

    // Measure performance
    const startTime = performance.now();

    const result = await loadServerHierarchicalMemory(
      dirs[0],
      dirs.slice(1),
      false, // debugMode
      fileService,
      [], // extensionContextFilePaths
      'flat', // importFormat
      undefined, // fileFilteringOptions
      200, // maxDirs
    );

    const duration = performance.now() - startTime;

    // Verify results
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.memoryContent).toBeTruthy();

    // Log performance
    console.log(`\n  Real-world Performance:`);
    console.log(
      `    Processed ${result.fileCount} files in ${duration.toFixed(2)}ms`,
    );
    console.log(
      `    Rate: ${(result.fileCount / (duration / 1000)).toFixed(2)} files/second\n`,
    );

    // Performance should be reasonable
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });
});
