#!/usr/bin/env node

/**
 * Quick integration test to verify NotebookEditTool is working
 */

import { promises as fs } from 'node:fs';
import { NotebookEditTool } from './packages/core/dist/src/tools/notebook-edit.js';

const TEST_NOTEBOOK_PATH = 'test-integration-notebook.ipynb';

// Mock config for testing
const mockConfig = {
  telemetry: { enabled: false },
  getUsageStatisticsEnabled: () => false,
  getTargetDir: () => process.cwd(),
};

const initialNotebook = {
  cells: [
    {
      id: 'initial1',
      cell_type: 'code',
      source: ['print("Hello from integration test!")\n'],
      metadata: {},
      execution_count: null,
      outputs: [],
    },
  ],
  metadata: {
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    },
  },
  nbformat: 4,
  nbformat_minor: 4,
};

async function testIntegration() {
  try {
    console.log('🧪 Testing NotebookEditTool Integration...\n');

    // Create test notebook
    await fs.writeFile(TEST_NOTEBOOK_PATH, JSON.stringify(initialNotebook, null, 2) + '\n');
    console.log('✓ Created test notebook');

    // Initialize the tool
    const tool = new NotebookEditTool(mockConfig);
    console.log('✓ NotebookEditTool initialized');

    // Test adding a cell
    const addInvocation = tool.build({
      absolute_path: process.cwd() + '/' + TEST_NOTEBOOK_PATH,
      operation: 'add_cell',
      cell_content: 'print("Added by integration test!")',
      cell_type: 'code',
    });

    const result = await addInvocation.execute(new AbortController().signal);
    
    if (result.error) {
      console.error('❌ Error adding cell:', result.error);
      return false;
    }
    
    console.log('✓ Successfully added cell:', result.llmContent);

    // Verify the result
    const updatedContent = await fs.readFile(TEST_NOTEBOOK_PATH, 'utf-8');
    const updatedNotebook = JSON.parse(updatedContent);
    
    if (updatedNotebook.cells.length === 2) {
      console.log('✓ Notebook now has 2 cells as expected');
    } else {
      console.error('❌ Expected 2 cells, got', updatedNotebook.cells.length);
      return false;
    }

    console.log('\n🎉 All integration tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return false;
  } finally {
    // Clean up
    try {
      await fs.unlink(TEST_NOTEBOOK_PATH);
      console.log('✓ Cleaned up test files');
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean up test files:', cleanupError.message);
    }
  }
}

testIntegration().then(success => {
  process.exit(success ? 0 : 1);
});
