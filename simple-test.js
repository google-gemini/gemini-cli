const { Config } = require('./packages/core/dist/src/config/config.js');
const { NotebookEditTool } = require('./packages/core/dist/src/tools/notebook-edit.js');
const path = require('path');

async function test() {
  console.log('🧪 Testing NotebookEditTool...');
  const config = new Config({ targetDir: process.cwd() });
  const tool = new NotebookEditTool(config);
  const testPath = path.resolve('test-notebook.ipynb');
  
  console.log('📍 Testing with:', testPath);
  
  const invocation = tool.createInvocation({
    file_path: testPath,
    operation: 'add_cell',
    cell_type: 'code',
    cell_content: 'print("Added by NotebookEditTool!")'
  });
  
  const result = await invocation.execute(new AbortController().signal);
  console.log('✅ Result:', result.llmContent);
  console.log('🎯 Display:', result.returnDisplay);
  if (result.error) {
    console.log('❌ Error:', result.error);
  } else {
    console.log('🎉 Test successful!');
  }
}

test().catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
