# 🧪 Practical Testing Guide for Notebook Edit Tool

## Prerequisites

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Project**
   ```bash
   npm run build
   ```

## Testing Methods

### Method 1: Unit Tests
Run the existing test suite to verify core functionality:

```bash
npm test -- --run packages/core/src/tools/notebook-edit.test.ts
```

### Method 2: Integration Testing Script
Use the provided test script to see the tool in action:

```bash
node test-notebook-tool.mjs
```

### Method 3: Manual Testing with CLI
Once built, you can test the tool directly through the Gemini CLI:

1. **Start the CLI**
   ```bash
   npx gemini-cli
   ```

2. **Test each operation** by asking the CLI to perform notebook edits:

#### Add a Cell
```
Please add a new code cell to the notebook test_notebook.ipynb with this content:
import matplotlib.pyplot as plt
plt.plot([1, 2, 3, 4])
plt.show()
```

#### Edit a Cell  
```
Please edit cell 0 in test_notebook.ipynb to change the title to "# Advanced Data Analysis Notebook"
```

#### Delete a Cell
```
Please delete cell 2 from test_notebook.ipynb
```

#### Move a Cell
```
Please move cell 1 to position 3 in test_notebook.ipynb
```

#### Clear Outputs
```
Please clear all outputs from test_notebook.ipynb
```

## Expected Tool Usage

When you make these requests, the CLI should automatically use the `notebook_edit` tool instead of trying to manually edit the JSON. You should see confirmations like:

```
[tool_call: notebook_edit with operation: add_cell, file_path: /full/path/to/test_notebook.ipynb]
```

## Verification Steps

### 1. Check Tool Registration
Verify the tool is properly registered:
```bash
npx gemini-cli
```
Then type: `/tools` to see if `notebook_edit` appears in the list.

### 2. Validate Notebook Structure
After each operation, check that the notebook is still valid JSON:
```bash
python -m json.tool test_notebook.ipynb
```

### 3. Open in Jupyter
Verify the notebook opens correctly in Jupyter:
```bash
jupyter notebook test_notebook.ipynb
```

## Test Scenarios

### Basic Operations Test
1. ✅ Add code cell
2. ✅ Add markdown cell  
3. ✅ Edit existing cell
4. ✅ Delete cell (not last one)
5. ✅ Move cell
6. ✅ Clear outputs

### Error Handling Test
1. ❌ Try to delete last remaining cell
2. ❌ Try to edit non-existent cell index
3. ❌ Try to use relative path
4. ❌ Try to edit non-existent file
5. ❌ Try invalid operation

### Edge Cases Test
1. 🔄 Move cell to same position
2. 📝 Add cell with array source format
3. 🎯 Insert at specific positions
4. 📊 Handle cells with complex metadata

## Success Criteria

✅ **Tool loads without errors**
✅ **All operations complete successfully**  
✅ **Notebook JSON remains valid**
✅ **Cell structure is preserved**
✅ **Metadata is maintained**
✅ **Error messages are clear and helpful**
✅ **CLI automatically selects notebook tool for .ipynb files**

## Troubleshooting

### Build Errors
If you encounter build errors:
1. Check Node.js version (requires v20+)
2. Clear node_modules: `rm -rf node_modules package-lock.json && npm install`
3. Check for TypeScript errors in the new tool files

### Tool Not Found
If the tool doesn't appear:
1. Verify it's exported in `packages/core/src/index.ts`
2. Check it's registered in `packages/core/src/config/config.ts`
3. Ensure the build completed successfully

### JSON Corruption
If notebooks get corrupted:
1. Check the JSON validation in the tool
2. Verify the source formatting logic
3. Test with simple notebooks first

## Performance Testing

For larger notebooks, test:
- Notebooks with 50+ cells
- Cells with large outputs
- Notebooks with complex metadata
- Multiple rapid operations

## Integration Testing

Test interaction with other tools:
- Use `read_file` to examine notebook content
- Use `glob` to find notebook files  
- Use `shell` to run jupyter commands
- Verify tool selection logic in system prompt
