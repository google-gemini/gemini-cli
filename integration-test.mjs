/**
 * Integration test for NotebookEditTool
 * This tests the tool with actual filesystem operations
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NotebookEditTool } from './packages/core/src/tools/notebook-edit.js';

const testNotebookPath = path.resolve('./test-notebook.ipynb');

// Simple mock config
const mockConfig = {
  telemetry: { enabled: false },
  // Add minimal required properties
};

async function testIntegration() {
  console.log('🧪 Testing NotebookEditTool integration...\n');

  try {
    const tool = new NotebookEditTool(mockConfig);

    // Test 1: Add a new cell
    console.log('📝 Test 1: Adding a new cell...');
    const invocation1 = tool.build({
      absolute_path: testNotebookPath,
      operation: 'add_cell',
      cell_content: 'import numpy as np\nprint("Added via tool!")',
      cell_type: 'code',
    });
    const result1 = await invocation1.execute();
    console.log(
      '✅ Result:',
      typeof result1.llmContent === 'string' ? result1.llmContent : 'Success',
    );

    // Test 2: Edit the first cell
    console.log('\n📝 Test 2: Editing first cell...');
    const invocation2 = tool.build({
      absolute_path: testNotebookPath,
      operation: 'edit_cell',
      cell_index: 0,
      cell_content: 'print("Modified first cell!")',
    });
    const result2 = await invocation2.execute();
    console.log(
      '✅ Result:',
      typeof result2.llmContent === 'string' ? result2.llmContent : 'Success',
    );

    // Test 3: Read and display final notebook content
    console.log('\n📝 Final notebook content:');
    const finalContent = await fs.readFile(testNotebookPath, 'utf-8');
    const notebook = JSON.parse(finalContent);
    console.log(`📊 Total cells: ${notebook.cells.length}`);
    notebook.cells.forEach((cell, index) => {
      console.log(
        `  Cell ${index} (${cell.cell_type}): ${cell.source.join('').trim()}`,
      );
    });

    console.log('\n✅ All integration tests passed!');
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  testIntegration();
}

export { testIntegration };
