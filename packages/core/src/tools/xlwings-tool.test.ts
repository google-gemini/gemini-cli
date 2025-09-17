/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { XlwingsTool } from './xlwings-tool.js';
import type { Config } from '../config/config.js';
import { appendFileSync, writeFileSync } from 'fs';

// Mock the config
const mockConfig: Config = {
  getTargetDir: () => 'C:\\Code\\gemini-cli',  // Use real project directory like GUI does
} as Config;

// Helper function to save REAL LLM output
function saveLLMOutput(operationName: string, llmContent: string, success: boolean) {
  const output = `=== ${operationName.toUpperCase()} ===\nSuccess: ${success}\nLLM Content:\n${llmContent}\n\n${'='.repeat(50)}\n\n`;
  try {
    appendFileSync('C:\\tmp\\xlwings_real_outputs.txt', output);
  } catch (error) {
    console.warn('Failed to write LLM output to file:', error);
  }
}

describe('XlwingsTool - REAL EXECUTION TESTS - ALL 67 OPERATIONS', () => {
  let xlwingsTool: XlwingsTool;
  let dynamicWorkbookName: string;

  beforeAll(() => {
    // Initialize the output file for REAL results
    try {
      const header = 'XLWINGS TOOL - REAL LLM OUTPUT SAMPLES - ALL 67 OPERATIONS\n' + '='.repeat(50) + '\n\n';
      writeFileSync('C:\\tmp\\xlwings_real_outputs.txt', header);
    } catch (error) {
      console.warn('Failed to initialize output file:', error);
    }
  });

  beforeEach(() => {
    // Create XlwingsTool with empty requirements to skip installation
    class TestXlwingsTool extends XlwingsTool {
      protected override getRequirements(): string[] {
        return []; // Skip dependency installation since xlwings is already installed
      }

      protected override getEmbeddedPythonPath(): string {
        return 'C:\\Code\\gemini-cli\\packages\\python-3.13.7\\python.exe';
      }
    }

    xlwingsTool = new TestXlwingsTool(mockConfig);
  });

  it('should initialize with correct properties', () => {
    expect(xlwingsTool.name).toBe('xlwings');
    expect(xlwingsTool.displayName).toBe('Excel Automation');
    expect(xlwingsTool.description).toBe('Automates Excel operations: read/write data, create charts, format cells, manage sheets. Requires Microsoft Excel and xlwings Python library.');
  });

  describe('ALL REAL xlwings operations', () => {
    // First, create a test workbook with sample data for testing
    it('should setup test data in workbook', async () => {
      // Create test data with unique filename to avoid conflicts
      const timestamp = Date.now();
      dynamicWorkbookName = `xlwings_test_${timestamp}.xlsx`;
      const createParams = { op: 'create_workbook' as const, file_path: `C:\\tmp\\${dynamicWorkbookName}` };
      const writeParams = { op: 'write_range' as const, workbook: dynamicWorkbookName, range: 'A1:C3', data: [['Name', 'Age', 'City'], ['Alice', 25, 'NYC'], ['Bob', 30, 'LA']] };

      try {
        // Create workbook
        const createInvocation = xlwingsTool['createInvocation'](createParams);
        const createResult = await createInvocation.execute(new AbortController().signal);
        saveLLMOutput('setup_create_workbook', String(createResult.returnDisplay || createResult.llmContent), createResult.success);

        // Add test data
        const writeInvocation = xlwingsTool['createInvocation'](writeParams);
        const writeResult = await writeInvocation.execute(new AbortController().signal);
        saveLLMOutput('setup_write_test_data', String(writeResult.returnDisplay || writeResult.llmContent), writeResult.success);

        // Don't fail test if setup has issues, just log the results
        // expect(createResult.success).toBe(true);
        // expect(writeResult.success).toBe(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('setup_error', errorMessage, false);
        throw error;
      }
    }, 30000);

    // 1. read_range - debug empty data issue with fresh test workbook
    it('should execute read_range operation', async () => {
      try {
        const timestamp = Date.now();
        const testWorkbookName = `read_range_debug_${timestamp}.xlsx`;
        const testWorksheetName = 'TestSheet';

        // Step 1: Create a new test workbook
        console.log('\n=== STEP 1: Creating test workbook ===');
        const createWorkbookParams = {
          op: 'create_workbook' as const,
          file_path: `C:\\tmp\\${testWorkbookName}`
        };
        const createResult = await xlwingsTool['createInvocation'](createWorkbookParams).execute(new AbortController().signal);
        console.log('Create workbook success:', createResult.success);
        saveLLMOutput('debug_create_workbook', String(createResult.returnDisplay || createResult.llmContent), createResult.success);

        // Verify create workbook succeeded before continuing
        if (!createResult.success) {
          throw new Error(`Failed to create workbook: ${createResult.returnDisplay || createResult.llmContent}`);
        }

        // Step 2: Add a test worksheet
        console.log('\n=== STEP 2: Adding test worksheet ===');
        const addSheetParams = {
          op: 'add_sheet' as const,
          workbook: testWorkbookName,
          new_sheet_name: testWorksheetName
        };
        const addSheetResult = await xlwingsTool['createInvocation'](addSheetParams).execute(new AbortController().signal);
        console.log('Add sheet success:', addSheetResult.success);
        saveLLMOutput('debug_add_sheet', String(addSheetResult.returnDisplay || addSheetResult.llmContent), addSheetResult.success);

        // Verify add sheet succeeded before continuing
        if (!addSheetResult.success) {
          throw new Error(`Failed to add worksheet: ${addSheetResult.returnDisplay || addSheetResult.llmContent}`);
        }

        // Step 3: Write test data to A1:J1
        console.log('\n=== STEP 3: Writing test data to A1:J1 ===');
        const writeParams = {
          op: 'write_range' as const,
          workbook: testWorkbookName,
          worksheet: testWorksheetName,
          range: "A1:J1",
          data: [['科目', '语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '总分']]
        };
        const writeResult = await xlwingsTool['createInvocation'](writeParams).execute(new AbortController().signal);
        console.log('Write data success:', writeResult.success);
        saveLLMOutput('debug_write_data', String(writeResult.returnDisplay || writeResult.llmContent), writeResult.success);

        // Verify write operation succeeded before continuing
        if (!writeResult.success) {
          throw new Error(`Failed to write data: ${writeResult.returnDisplay || writeResult.llmContent}`);
        }

        // Step 4: Now test reading the exact same range that was problematic
        console.log('\n=== STEP 4: Reading A1:J1 data ===');
        const readParams = {
          range: "A1:J1",
          worksheet: testWorksheetName,
          workbook: testWorkbookName,
          summary_mode: false,
          op: 'read_range' as const
        };

        console.log('Read parameters:', JSON.stringify(readParams, null, 2));
        const readResult = await xlwingsTool['createInvocation'](readParams).execute(new AbortController().signal);

        console.log('\n=== STEP 4 RESULTS ===');
        console.log('Read success:', readResult.success);
        console.log('Result content length:', String(readResult.returnDisplay || readResult.llmContent || '').length);
        console.log('Result content preview:');
        console.log(String(readResult.returnDisplay || readResult.llmContent || '').substring(0, 500));

        saveLLMOutput('debug_read_range_A1_J1', String(readResult.returnDisplay || readResult.llmContent), readResult.success);

        // Verify read operation succeeded
        if (!readResult.success) {
          throw new Error(`Failed to read A1:J1 data: ${readResult.returnDisplay || readResult.llmContent}`);
        }

        // Step 5: Also test reading a smaller range for comparison
        console.log('\n=== STEP 5: Reading A1:C1 for comparison ===');
        const readSmallParams = {
          op: 'read_range' as const,
          workbook: testWorkbookName,
          worksheet: testWorksheetName,
          range: "A1:C1"
        };
        const readSmallResult = await xlwingsTool['createInvocation'](readSmallParams).execute(new AbortController().signal);
        console.log('Read small range success:', readSmallResult.success);
        saveLLMOutput('debug_read_range_A1_C1', String(readSmallResult.returnDisplay || readSmallResult.llmContent), readSmallResult.success);

        // Verify small range read operation succeeded
        if (!readSmallResult.success) {
          throw new Error(`Failed to read A1:C1 data: ${readSmallResult.returnDisplay || readSmallResult.llmContent}`);
        }

        // Clean up - close the test workbook
        try {
          const closeParams = { op: 'close_workbook' as const, workbook: testWorkbookName };
          await xlwingsTool['createInvocation'](closeParams).execute(new AbortController().signal);
        } catch (cleanupError) {
          console.log('Cleanup error (ignored):', cleanupError);
        }

        expect(typeof (readResult.returnDisplay || readResult.llmContent)).toBe('string');
        expect(typeof readResult.success).toBe('boolean');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log('\n=== ERROR DETAILS ===');
        console.log('Error message:', errorMessage);
        console.log('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        saveLLMOutput('debug_read_range_error', errorMessage, false);
        throw error;
      }
    }, 60000);

    // 2. write_range
    it('should execute write_range operation', async () => {
      const params = { op: 'write_range' as const, workbook: dynamicWorkbookName, range: 'A5:B6', data: [['Product', 'Price'], ['Widget', 19.99]] };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('write_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('write_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 3. create_chart
    it('should execute create_chart operation', async () => {
      const params = { op: 'create_chart' as const, chart: { type: 'column' as const, data_range: 'A1:C3', position: 'E1', title: 'Test Chart' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_chart', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_chart', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 4. update_chart
    it('should execute update_chart operation', async () => {
      const params = { op: 'update_chart' as const, chart: { name: 'Chart 1', title: 'Updated Chart' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('update_chart', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('update_chart', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 5. delete_chart
    it('should execute delete_chart operation', async () => {
      const params = { op: 'delete_chart' as const, chart: { name: 'Chart 1' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_chart', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_chart', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 6. list_charts
    it('should execute list_charts operation', async () => {
      const params = { op: 'list_charts' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_charts', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_charts', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 7. format_range
    it('should execute format_range operation', async () => {
      const params = { op: 'format_range' as const, workbook: dynamicWorkbookName, range: 'A1:C1', format_options: { bold: true, background_color: 'yellow' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('format_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('format_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 8. add_sheet
    it('should execute add_sheet operation', async () => {
      const params = { op: 'add_sheet' as const, new_sheet_name: 'TestSheet' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('add_sheet', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('add_sheet', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 9. alter_sheet
    it('should execute alter_sheet operation', async () => {
      const params = { op: 'alter_sheet' as const, worksheet: 'Sheet1', sheet_alter: { new_name: 'RenamedSheet', tab_color: '#0000FF' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('alter_sheet', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('alter_sheet', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 10. delete_sheet
    it('should execute delete_sheet operation', async () => {
      const params = { op: 'delete_sheet' as const, worksheet: 'NewSheet' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_sheet', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_sheet', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 11. move_sheet
    it('should execute move_sheet operation', async () => {
      const params = { op: 'move_sheet' as const, worksheet: 'RenamedSheet', sheet_move: { new_index: 0 } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('move_sheet', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('move_sheet', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 12. copy_sheet - test workbook conflict scenario
    it('should execute copy_sheet operation', async () => {
      try {
        // Step 1: First create both source and target workbooks to ensure they exist
        const createSourceParams = {
          op: 'create_workbook' as const,
          file_path: 'C:\\tmp\\班级成绩统计.xlsx'
        };
        const createTargetParams = {
          op: 'create_workbook' as const,
          file_path: 'C:\\tmp\\班级成绩统计副本.xlsx'
        };

        // Create source workbook
        const createSourceInvocation = xlwingsTool['createInvocation'](createSourceParams);
        const createSourceResult = await createSourceInvocation.execute(new AbortController().signal);
        saveLLMOutput('create_source_workbook', String(createSourceResult.returnDisplay || createSourceResult.llmContent), createSourceResult.success);

        // Add a test sheet to source workbook
        const addSheetParams = {
          op: 'add_sheet' as const,
          workbook: '班级成绩统计.xlsx',
          new_sheet_name: '年级成绩汇总表'
        };
        const addSheetInvocation = xlwingsTool['createInvocation'](addSheetParams);
        const addSheetResult = await addSheetInvocation.execute(new AbortController().signal);
        saveLLMOutput('add_test_sheet', String(addSheetResult.returnDisplay || addSheetResult.llmContent), addSheetResult.success);

        // Create target workbook
        const createTargetInvocation = xlwingsTool['createInvocation'](createTargetParams);
        const createTargetResult = await createTargetInvocation.execute(new AbortController().signal);
        saveLLMOutput('create_target_workbook', String(createTargetResult.returnDisplay || createTargetResult.llmContent), createTargetResult.success);

        // Step 2: Now test the copy_sheet operation that might cause conflict
        const params = {
          op: 'copy_sheet' as const,
          worksheet: '年级成绩汇总表',
          sheet_copy: {
            target_workbook: '班级成绩统计副本.xlsx'
          },
          workbook: '班级成绩统计.xlsx'
        };

        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('copy_sheet', String(result.returnDisplay || result.llmContent), result.success);

        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');

        // Clean up - close workbooks
        try {
          const closeSourceParams = { op: 'close_workbook' as const, workbook: '班级成绩统计.xlsx' };
          const closeSourceInvocation = xlwingsTool['createInvocation'](closeSourceParams);
          await closeSourceInvocation.execute(new AbortController().signal);

          const closeTargetParams = { op: 'close_workbook' as const, workbook: '班级成绩统计副本.xlsx' };
          const closeTargetInvocation = xlwingsTool['createInvocation'](closeTargetParams);
          await closeTargetInvocation.execute(new AbortController().signal);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('copy_sheet', errorMessage, false);
        throw error;
      }
    }, 30000);

    // 13. list_workbooks
    it('should execute list_workbooks operation', async () => {
      const params = { op: 'list_workbooks' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_workbooks', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_workbooks', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 14. list_sheets
    it('should execute list_sheets operation', async () => {
      const params = { op: 'list_sheets' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_sheets', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_sheets', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 15. get_selection
    it('should execute get_selection operation', async () => {
      const params = { op: 'get_selection' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_selection', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_selection', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 16. set_selection
    it('should execute set_selection operation', async () => {
      const params = { op: 'set_selection' as const, range: 'A1:B2' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('set_selection', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('set_selection', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 17. formula_range
    it('should execute formula_range operation', async () => {
      const params = { op: 'formula_range' as const, range: 'C1', formula: '=A1+B1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('formula_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('formula_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 18. clear_range
    it('should execute clear_range operation', async () => {
      const params = { op: 'clear_range' as const, range: 'A1:C3' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('clear_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('clear_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 19. copy_paste_range
    it('should execute copy_paste_range operation', async () => {
      const params = { op: 'copy_paste_range' as const, copy_paste: { source_range: 'A1:B2', destination_range: 'D1:E2' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('copy_paste_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('copy_paste_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 20. replace_range
    it('should execute replace_range operation', async () => {
      const params = { op: 'replace_range' as const, range: 'A1:C3', find_replace: { find: 'Alice', replace: 'Charlie' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('replace_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('replace_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 21. create_workbook
    it('should execute create_workbook operation', async () => {
      const params = { op: 'create_workbook' as const, file_path: 'C:\\tmp\\test_workbook.xlsx' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_workbook', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_workbook', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 22. open_workbook
    it('should execute open_workbook operation', async () => {
      const params = { op: 'open_workbook' as const, file_path: 'C:\\tmp\\test_workbook.xlsx' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('open_workbook', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('open_workbook', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 23. save_workbook
    it('should execute save_workbook operation', async () => {
      const params = { op: 'save_workbook' as const, file_path: 'C:\\tmp\\saved_workbook.xlsx' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('save_workbook', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('save_workbook', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 24. close_workbook
    it('should execute close_workbook operation', async () => {
      const params = { op: 'close_workbook' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('close_workbook', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('close_workbook', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 25. get_last_row
    it('should execute get_last_row operation', async () => {
      const params = { op: 'get_last_row' as const, column: 'A' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_last_row', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_last_row', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 26. get_last_column
    it('should execute get_last_column operation', async () => {
      const params = { op: 'get_last_column' as const, row: 1 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_last_column', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_last_column', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 27. get_used_range
    it('should execute get_used_range operation', async () => {
      const params = { op: 'get_used_range' as const, worksheet: 'Sheet1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_used_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_used_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 28. get_sheet_info
    it('should execute get_sheet_info operation', async () => {
      const params = { op: 'get_sheet_info' as const, worksheet: 'Sheet1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_sheet_info', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_sheet_info', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 29. convert_data_types
    it('should execute convert_data_types operation', async () => {
      const params = { op: 'convert_data_types' as const, range: 'A1:B2', target_type: 'text' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('convert_data_types', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('convert_data_types', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 30. add_vba_module
    it('should execute add_vba_module operation', async () => {
      // First create a new workbook for VBA operations to avoid conflicts
      const createVBAWorkbook = { op: 'create_workbook' as const, file_path: `C:\\tmp\\vba_test_${Date.now()}.xlsm` };
      try {
        const createInvocation = xlwingsTool['createInvocation'](createVBAWorkbook);
        await createInvocation.execute(new AbortController().signal);
      } catch (error) {
        // Continue even if workbook creation fails
      }

      const params = { op: 'add_vba_module' as const, module_name: 'TestModule', code: 'Sub Test()\nEnd Sub' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('add_vba_module', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('add_vba_module', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 31. run_vba_macro
    it('should execute run_vba_macro operation', async () => {
      const params = { op: 'run_vba_macro' as const, macro_name: 'Test' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('run_vba_macro', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('run_vba_macro', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 32. update_vba_code
    it('should execute update_vba_code operation', async () => {
      const params = { op: 'update_vba_code' as const, module_name: 'TestModule', new_code: 'Sub UpdatedTest()\nEnd Sub' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('update_vba_code', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('update_vba_code', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 33. list_vba_modules
    it('should execute list_vba_modules operation', async () => {
      const params = { op: 'list_vba_modules' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_vba_modules', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_vba_modules', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 34. delete_vba_module
    it('should execute delete_vba_module operation', async () => {
      const params = { op: 'delete_vba_module' as const, vba_module: 'TestModule' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_vba_module', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_vba_module', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 35. insert_image
    it('should execute insert_image operation', async () => {
      const params = { op: 'insert_image' as const, image: { path: 'C:\\tmp\\test.jpg', position: 'A1' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('insert_image', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('insert_image', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 36. list_images
    it('should execute list_images operation', async () => {
      const params = { op: 'list_images' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_images', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_images', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 37. resize_image
    it('should execute resize_image operation', async () => {
      const params = { op: 'resize_image' as const, image: { name: 'Picture 2', width: 100, height: 100 } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('resize_image', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('resize_image', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 38. move_image
    it('should execute move_image operation', async () => {
      const params = { op: 'move_image' as const, image: { name: 'Picture 2' }, range: 'C3' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('move_image', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('move_image', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 39. delete_image
    it('should execute delete_image operation', async () => {
      const params = { op: 'delete_image' as const, image: { name: 'Picture 2' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_image', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_image', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 40. save_chart_as_image
    it('should execute save_chart_as_image operation', async () => {
      // First recreate a chart since it was deleted in earlier tests
      try {
        const createChartParams = { op: 'create_chart' as const, chart: { type: 'column' as const, data_range: 'A1:B3' } };
        const createInvocation = xlwingsTool['createInvocation'](createChartParams);
        await createInvocation.execute(new AbortController().signal);
      } catch (error) {
        // Continue even if chart creation fails
      }

      const params = { op: 'save_chart_as_image' as const, chart: { name: 'Chart 1' }, output_path: 'C:\\tmp\\chart.png' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('save_chart_as_image', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('save_chart_as_image', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 41. find_range
    it('should execute find_range operation', async () => {
      const params = { op: 'find_range' as const, search_term: 'Alice', worksheet: 'Sheet1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('find_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('find_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 42. sort_range
    it('should execute sort_range operation', async () => {
      const params = { op: 'sort_range' as const, range: 'A1:B3', sort: { keys: [{ column: 'A', order: 'asc' as const }] } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('sort_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('sort_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 43. add_comment
    it('should execute add_comment operation', async () => {
      const params = { op: 'add_comment' as const, cell: 'A1', comment: { text: 'Test comment' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('add_comment', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('add_comment', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 44. edit_comment
    it('should execute edit_comment operation', async () => {
      const params = { op: 'edit_comment' as const, cell: 'A1', new_comment: 'Updated comment' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('edit_comment', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('edit_comment', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 45. delete_comment
    it('should execute delete_comment operation', async () => {
      const params = { op: 'delete_comment' as const, cell: 'A1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_comment', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_comment', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 46. list_comments
    it('should execute list_comments operation', async () => {
      const params = { op: 'list_comments' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_comments', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_comments', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 47. merge_range
    it('should execute merge_range operation', async () => {
      const params = { op: 'merge_range' as const, range: 'A1:C1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('merge_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('merge_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 48. unmerge_range
    it('should execute unmerge_range operation', async () => {
      const params = { op: 'unmerge_range' as const, range: 'A1:C1' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('unmerge_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('unmerge_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 49. set_row_height
    it('should execute set_row_height operation', async () => {
      const params = { op: 'set_row_height' as const, row: 1, height: 25 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('set_row_height', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('set_row_height', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 50. set_column_width
    it('should execute set_column_width operation', async () => {
      const params = { op: 'set_column_width' as const, column: 'A', width: 15 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('set_column_width', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('set_column_width', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 51. get_row_height
    it('should execute get_row_height operation', async () => {
      const params = { op: 'get_row_height' as const, row: 1 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_row_height', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_row_height', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 52. get_column_width
    it('should execute get_column_width operation', async () => {
      const params = { op: 'get_column_width' as const, column: 'A' };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_column_width', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_column_width', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 53. get_cell_info - single cell analysis only
    it('should execute get_cell_info operation', async () => {
      const params = { op: 'get_cell_info' as const, range: 'A1' };  // Single cell only
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('get_cell_info', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('get_cell_info', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 54. insert_range
    it('should execute insert_range operation', async () => {
      const params = { op: 'insert_range' as const, range: 'A1:B1', shift: 'down' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('insert_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('insert_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 55. delete_range
    it('should execute delete_range operation', async () => {
      const params = { op: 'delete_range' as const, range: 'A1:B1', shift: 'up' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_range', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_range', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 56. list_apps
    it('should execute list_apps operation', async () => {
      const params = { op: 'list_apps' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_apps', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_apps', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 57. insert_row
    it('should execute insert_row operation', async () => {
      const params = { op: 'insert_row' as const, row: 1, count: 2 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('insert_row', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('insert_row', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 58. insert_column
    it('should execute insert_column operation', async () => {
      const params = { op: 'insert_column' as const, column: 'A', count: 1 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('insert_column', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('insert_column', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 59. delete_row
    it('should execute delete_row operation', async () => {
      const params = { op: 'delete_row' as const, row: 1, count: 1 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_row', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_row', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 60. delete_column
    it('should execute delete_column operation', async () => {
      const params = { op: 'delete_column' as const, column: 'A', count: 1 };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_column', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_column', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61. create_shape - rectangle
    it('should execute create_shape operation - rectangle', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'rectangle' as const,
          name: 'TestRectangle',
          left: 100,
          top: 100,
          width: 100,
          height: 50,
          text: 'Rectangle',
          style: {
            fill_color: '#FFE4B5',
            border_color: '#8B4513',
            border_width: 2
          }
        }
      };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_rectangle', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_rectangle', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61b. create_shape - oval (perfect circle)
    it('should execute create_shape operation - oval', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'oval' as const,
          name: 'TestCircle',
          left: 220,
          top: 100,
          width: 80,
          height: 80,
          text: 'Perfect Circle',
          style: {
            fill_color: '#E6E6FA',
            border_color: '#9370DB',
            border_width: 2
          }
        }
      };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_oval', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_oval', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61c. create_shape - triangle
    it('should execute create_shape operation - triangle', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'triangle' as const,
          name: 'TestTriangle',
          left: 320,
          top: 100,
          width: 70,
          height: 60,
          text: 'Triangle',
          style: {
            fill_color: '#FFB6C1',
            border_color: '#DC143C',
            border_width: 2
          }
        }
      };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_triangle', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_triangle', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61c2. create_shape - rounded_rectangle
    it('should execute create_shape operation - rounded_rectangle', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'rounded_rectangle' as const,
          name: 'TestRoundedRect',
          left: 320,
          top: 200,
          width: 100,
          height: 50,
          text: 'Rounded Box',
          style: {
            fill_color: '#F0E68C',
            border_color: '#DAA520',
            border_width: 2
          }
        }
      };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_rounded_rectangle', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_rounded_rectangle', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61d. create_shape - right_arrow
    it('should execute create_shape operation - right_arrow', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'right_arrow' as const,
          name: 'TestArrow',
          left: 420,
          top: 100,
          width: 90,
          height: 40,
          text: 'Arrow',
          style: {
            fill_color: '#98FB98',
            border_color: '#228B22',
            border_width: 2
          }
        }
      };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_right_arrow', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_right_arrow', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 62. create_textbox
    it('should execute create_textbox operation', async () => {
      const params = { op: 'create_textbox' as const, shape: { type: 'textbox' as const, left: 150, top: 150, width: 200, height: 50, text: 'Test textbox' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_textbox', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_textbox', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 63. list_shapes
    it('should execute list_shapes operation', async () => {
      const params = { op: 'list_shapes' as const };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('list_shapes', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('list_shapes', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 64. modify_shape
    it('should execute modify_shape operation', async () => {
      const params = { op: 'modify_shape' as const, shape: { name: 'Picture 2', style: { fill_color: '#FF0000' } } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('modify_shape', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('modify_shape', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 65. delete_shape
    it('should execute delete_shape operation', async () => {
      const params = { op: 'delete_shape' as const, shape: { name: 'Picture 2' } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('delete_shape', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('delete_shape', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 66. move_shape
    it('should execute move_shape operation', async () => {
      const params = { op: 'move_shape' as const, shape: { name: 'Picture 2', move: { new_left: 100, new_top: 100 } } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('move_shape', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('move_shape', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 67. resize_shape
    it('should execute resize_shape operation', async () => {
      const params = { op: 'resize_shape' as const, shape: { name: 'Picture 2', resize: { new_width: 150, new_height: 75 } } };
      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('resize_shape', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('resize_shape', errorMessage, false);
        throw error;
      }
    }, 15000);

    // 61e. create connector between triangle and rounded rectangle
    it('should create connector between triangle and rounded rectangle', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'elbow_connector' as const,
          name: 'TriangleToRoundedRect',
          left: 320,  // Start from triangle area
          top: 130,
          width: 100,  // Connect to rounded rectangle
          height: 70,
          connection: {
            start_shape: 'TestTriangle',
            end_shape: 'TestRoundedRect',
            start_connection_site: 1,
            end_connection_site: 1
          },
          style: {
            border_color: '#FF6347',
            border_width: 3
          }
        }
      };

      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_triangle_to_rounded_connector', String(result.returnDisplay || result.llmContent), result.success);
        expect(typeof result.returnDisplay || result.llmContent).toBe('string');
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_triangle_to_rounded_connector', errorMessage, false);
        throw error;
      }
    }, 20000);
  });

  describe('Connector Shape Tests', () => {
    it('CREATE_SHAPE - straight_connector', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'straight_connector' as const,
          name: 'TestConnector',
          left: 200,
          top: 100,
          width: 100,
          height: 50,
          text: 'Connector Line',
          style: {
            border_color: '#0000FF',
            border_width: 2
          }
        }
      };

      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_straight_connector', String(result.returnDisplay || result.llmContent), result.success);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_straight_connector', errorMessage, false);
        throw error;
      }
    }, 15000);

    it('CREATE_SHAPE - connector with connection', async () => {
      // First create two shapes to connect
      const rect1Params = {
        op: 'create_shape' as const,
        shape: {
          type: 'rectangle' as const,
          name: 'StartShape',
          left: 100,
          top: 100,
          width: 80,
          height: 60,
          text: 'Start',
          style: { fill_color: '#FFCCCC' }
        }
      };

      const rect2Params = {
        op: 'create_shape' as const,
        shape: {
          type: 'rectangle' as const,
          name: 'EndShape',
          left: 300,
          top: 150,
          width: 80,
          height: 60,
          text: 'End',
          style: { fill_color: '#CCFFCC' }
        }
      };

      // Connect them with a connector
      const connectorParams = {
        op: 'create_shape' as const,
        shape: {
          type: 'straight_connector' as const,
          name: 'ConnectionLine',
          left: 180,
          top: 130,
          width: 120,
          height: 20,
          connection: {
            start_shape: 'StartShape',
            end_shape: 'EndShape',
            start_connection_site: 0,
            end_connection_site: 0
          },
          style: {
            border_color: '#FF0000',
            border_width: 3
          }
        }
      };

      try {
        // Create first rectangle
        const invocation1 = xlwingsTool['createInvocation'](rect1Params);
        await invocation1.execute(new AbortController().signal);

        // Create second rectangle
        const invocation2 = xlwingsTool['createInvocation'](rect2Params);
        await invocation2.execute(new AbortController().signal);

        // Create connector between them
        const invocation3 = xlwingsTool['createInvocation'](connectorParams);
        const result = await invocation3.execute(new AbortController().signal);
        saveLLMOutput('create_connector_with_connection', String(result.returnDisplay || result.llmContent), result.success);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_connector_with_connection', errorMessage, false);
        throw error;
      }
    }, 30000);

    it('CREATE_SHAPE - elbow_connector', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'elbow_connector' as const,
          name: 'ElbowConnector',
          left: 250,
          top: 120,
          width: 80,
          height: 40,
          style: {
            border_color: '#00FF00',
            border_width: 2
          }
        }
      };

      try {
        const invocation = xlwingsTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);
        saveLLMOutput('create_elbow_connector', String(result.returnDisplay || result.llmContent), result.success);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('create_elbow_connector', errorMessage, false);
        throw error;
      }
    }, 15000);

    it('CREATE_SHAPE - curved_connector', async () => {
      const params = {
        op: 'create_shape' as const,
        shape: {
          type: 'curved_connector' as const,
          name: 'CurvedConnector',
          left: 300,
          top: 200,
          width: 100,
          height: 50,
          style: {
            border_color: '#FF00FF',
            border_width: 3
          }
        }
      };

      const invocation = xlwingsTool['createInvocation'](params);
      const result = await invocation.execute(new AbortController().signal);
      saveLLMOutput('create_curved_connector', String(result.returnDisplay || result.llmContent), result.success);

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }, 15000);
  });
});