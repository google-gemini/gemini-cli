# Jupyter Notebook Editing Tool Implementation

## Problem Statement

The Gemini CLI was experiencing significant issues when editing Jupyter notebook files because:

1. **No dedicated tool for notebooks** - The CLI relied on generic text editing tools
2. **JSON format complexity** - Manual editing often corrupted the notebook structure
3. **Unreliable editing** - The `replace_string_in_file` tool couldn't handle notebook JSON reliably
4. **Frequent failures** - Users reported constant errors and notebook corruption

## Solution Overview

I've implemented a comprehensive solution by creating a dedicated `NotebookEditTool` that:

### 1. Understands Jupyter Notebook Structure
- Properly parses and validates Jupyter notebook JSON format
- Maintains notebook metadata, cell IDs, execution counts, and outputs
- Validates nbformat version compatibility

### 2. Provides Safe Cell Operations
- **Add Cell**: Insert new code, markdown, or raw cells at any position
- **Edit Cell**: Modify existing cell content while preserving structure
- **Delete Cell**: Remove cells with safety checks (prevents deleting last cell)
- **Move Cell**: Reorder cells by moving them to different positions
- **Clear Outputs**: Remove all execution results and reset execution counts

### 3. Maintains Data Integrity
- Validates JSON structure before and after modifications
- Preserves cell metadata and notebook-level metadata
- Handles both string and array source formats correctly
- Generates proper cell IDs for new cells

### 4. Integrates with Existing Tool System
- Follows the same patterns as other core tools
- Implements proper error handling and logging
- Includes comprehensive parameter validation
- Supports confirmation workflows

## Implementation Details

### Files Created/Modified:

1. **`packages/core/src/tools/notebook-edit.ts`** - Main tool implementation
2. **`packages/core/src/tools/notebook-edit.test.ts`** - Comprehensive test suite
3. **`packages/core/src/tools/tool-error.ts`** - Added notebook-specific error types
4. **`packages/core/src/config/config.ts`** - Registered the tool in core tools
5. **`packages/core/src/core/prompts.ts`** - Updated system prompt to include notebook guidance
6. **`packages/core/src/index.ts`** - Exported the new tool

### Key Features:

#### Tool Parameters:
- `file_path`: Absolute path to notebook file (required)
- `operation`: Type of operation to perform (required)
- `cell_index`: Target cell index for operations (when applicable)
- `cell_content`: New content for add/edit operations
- `cell_type`: Type of cell (code, markdown, raw)
- `target_index`: Destination for move operations
- `insert_position`: Where to insert new cells (before, after, end)

#### Supported Operations:
1. `add_cell` - Add new cells with specified content and type
2. `edit_cell` - Modify existing cell content
3. `delete_cell` - Remove cells (with last-cell protection)
4. `move_cell` - Reorder cells within notebook
5. `clear_outputs` - Reset all execution outputs

#### Error Handling:
- File existence validation
- JSON parsing error detection
- Notebook structure validation
- Parameter validation with detailed error messages
- Protection against corrupting notebook structure

### Usage Examples:

```typescript
// Add a new code cell
await tool.execute({
  file_path: '/path/to/notebook.ipynb',
  operation: 'add_cell',
  cell_content: 'import pandas as pd\ndf = pd.read_csv("data.csv")',
  cell_type: 'code'
});

// Edit an existing cell
await tool.execute({
  file_path: '/path/to/notebook.ipynb',
  operation: 'edit_cell',
  cell_index: 2,
  cell_content: 'print("Updated code")'
});

// Clear all outputs
await tool.execute({
  file_path: '/path/to/notebook.ipynb',
  operation: 'clear_outputs'
});
```

## System Prompt Integration

The tool is now properly integrated into the Gemini CLI's system prompt with specific guidance:

- **Jupyter Notebooks**: Use the 'notebook_edit' tool for editing Jupyter notebook files (.ipynb). This tool can add, edit, delete, move cells, and clear outputs while maintaining proper notebook structure and JSON formatting. Never manually edit notebook files with text editing tools, as this can corrupt the JSON structure.

## Benefits

1. **Reliability**: No more JSON corruption or formatting issues
2. **Safety**: Built-in validation prevents notebook damage
3. **Comprehensive**: Supports all common notebook editing operations
4. **User-friendly**: Clear error messages and operation descriptions
5. **Integrated**: Works seamlessly with existing CLI workflows

## Testing

The implementation includes comprehensive tests covering:
- All operation types (add, edit, delete, move, clear)
- Error conditions (invalid files, malformed JSON, invalid parameters)
- Edge cases (single cell notebooks, invalid indices)
- Parameter validation and error messages

## Future Enhancements

Potential future improvements could include:
- Batch operations for multiple cells
- Cell metadata editing
- Kernel specification management  
- Output format preservation
- Integration with notebook execution

## Conclusion

This implementation resolves the core issue described in the GitHub issue by providing a robust, dedicated tool for Jupyter notebook editing that eliminates the reliability problems users were experiencing with the previous approach.
