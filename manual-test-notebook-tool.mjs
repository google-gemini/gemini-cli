#!/usr/bin/env node

/**
 * Manual test script for NotebookEditTool
 * This script demonstrates all the functionality of the NotebookEditTool
 */

import { promises as fs } from 'node:fs';
import { NotebookEditTool } from './packages/core/src/tools/notebook-edit.js';

const TEST_NOTEBOOK_PATH = './test-notebook-manual.ipynb';

// Mock config for testing
const mockConfig = {
  telemetry: { enabled: false },
};

const initialNotebook = {
  cells: [
    {
      id: 'initial1',
      cell_type: 'code',
      source: ['print("Initial cell")\n'],
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

async function createTestNotebook() {
  await fs.writeFile(
    TEST_NOTEBOOK_PATH,
    JSON.stringify(initialNotebook, null, 2) + '\n',
  );
  console.log('✅ Created test notebook');
}

async function testAddCell() {
  console.log('\n🧪 Testing add_cell operation...');
  const tool = new NotebookEditTool(mockConfig);

  // Add a code cell
  const result1 = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'add_cell',
    cell_content: 'import numpy as np\nprint("Added code cell")',
    cell_type: 'code',
  });
  console.log('Add code cell:', result1);

  // Add a markdown cell at position 1
  const result2 = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'add_cell',
    cell_content: '# This is a header\n\nThis is some markdown content.',
    cell_type: 'markdown',
    position: 1,
  });
  console.log('Add markdown cell:', result2);
}

async function testEditCell() {
  console.log('\n🧪 Testing edit_cell operation...');
  const tool = new NotebookEditTool(mockConfig);

  // Edit cell by index
  const result1 = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'edit_cell',
    cell_index: 0,
    cell_content: 'print("Edited initial cell")\nprint("Added another line")',
  });
  console.log('Edit by index:', result1);
}

async function testMoveCell() {
  console.log('\n🧪 Testing move_cell operation...');
  const tool = new NotebookEditTool(mockConfig);

  const result = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'move_cell',
    source_index: 2,
    destination_index: 0,
  });
  console.log('Move cell:', result);
}

async function testClearOutputs() {
  console.log('\n🧪 Testing clear_outputs operation...');
  const tool = new NotebookEditTool(mockConfig);

  // First, let's add some mock outputs to the notebook
  const notebook = JSON.parse(await fs.readFile(TEST_NOTEBOOK_PATH, 'utf-8'));
  notebook.cells.forEach((cell) => {
    if (cell.cell_type === 'code') {
      cell.outputs = [{ output_type: 'stream', text: ['Mock output\n'] }];
      cell.execution_count = 1;
    }
  });
  await fs.writeFile(
    TEST_NOTEBOOK_PATH,
    JSON.stringify(notebook, null, 2) + '\n',
  );

  const result = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'clear_outputs',
  });
  console.log('Clear outputs:', result);
}

async function testDeleteCell() {
  console.log('\n🧪 Testing delete_cell operation...');
  const tool = new NotebookEditTool(mockConfig);

  const result = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'delete_cell',
    cell_index: 1,
  });
  console.log('Delete cell:', result);
}

async function testErrorConditions() {
  console.log('\n🧪 Testing error conditions...');
  const tool = new NotebookEditTool(mockConfig);

  // Test invalid file path
  const result1 = await tool._call({
    file_path: 'relative/path.ipynb',
    operation: 'add_cell',
  });
  console.log('Relative path error:', result1);

  // Test non-existent file
  const result2 = await tool._call({
    file_path: '/nonexistent/path.ipynb',
    operation: 'add_cell',
  });
  console.log('Non-existent file error:', result2);

  // Test invalid cell index
  const result3 = await tool._call({
    file_path: TEST_NOTEBOOK_PATH,
    operation: 'edit_cell',
    cell_index: 999,
  });
  console.log('Invalid index error:', result3);
}

async function displayFinalNotebook() {
  console.log('\n📋 Final notebook content:');
  const content = await fs.readFile(TEST_NOTEBOOK_PATH, 'utf-8');
  console.log(content);
}

async function cleanup() {
  try {
    await fs.unlink(TEST_NOTEBOOK_PATH);
    console.log('\n🧹 Cleaned up test files');
  } catch (error) {
    // File might not exist, ignore
  }
}

async function runAllTests() {
  console.log('🚀 Starting NotebookEditTool manual tests...\n');

  try {
    await createTestNotebook();
    await testAddCell();
    await testEditCell();
    await testMoveCell();
    await testClearOutputs();
    await testDeleteCell();
    await testErrorConditions();
    await displayFinalNotebook();

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await cleanup();
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };
