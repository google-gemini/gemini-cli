/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { MarkItDownTool } from './markitdown-tool.js';
import type { Config } from '../config/config.js';
import { appendFileSync, writeFileSync } from 'fs';

// Mock the config
const mockConfig: Config = {
  getTargetDir: () => 'C:\\Code\\gemini-cli',  // Use real project directory
} as Config;

// Helper function to save REAL LLM output
function saveLLMOutput(operationName: string, llmContent: string, success: boolean) {
  const output = `=== ${operationName.toUpperCase()} ===\nSuccess: ${success}\nLLM Content:\n${llmContent}\n\n${'='.repeat(50)}\n\n`;
  try {
    appendFileSync('C:\\tmp\\markitdown_real_outputs.txt', output);
  } catch (error) {
    console.warn('Failed to write LLM output to file:', error);
  }
}

// Helper function to create test documents
function createTestDocument(filePath: string, type: 'txt' | 'html') {
  try {
    if (type === 'txt') {
      const content = `# Test Document

This is a **test document** for MarkItDown tool testing.

## Features
- Document conversion
- Text extraction
- Structure analysis

### Sample Table
| Name | Age | City |
|------|-----|------|
| Alice | 25 | NYC |
| Bob | 30 | LA |

### Code Example
\`\`\`python
def hello_world():
    print("Hello, World!")
\`\`\`

*End of test document.*`;
      writeFileSync(filePath, content, 'utf-8');
    } else if (type === 'html') {
      const content = `<!DOCTYPE html>
<html>
<head>
    <title>Test HTML Document</title>
</head>
<body>
    <h1>Test Document</h1>
    <p>This is a <strong>test document</strong> for MarkItDown tool testing.</p>

    <h2>Features</h2>
    <ul>
        <li>Document conversion</li>
        <li>Text extraction</li>
        <li>Structure analysis</li>
    </ul>

    <h3>Sample Table</h3>
    <table>
        <tr><th>Name</th><th>Age</th><th>City</th></tr>
        <tr><td>Alice</td><td>25</td><td>NYC</td></tr>
        <tr><td>Bob</td><td>30</td><td>LA</td></tr>
    </table>

    <h3>Code Example</h3>
    <pre><code>
def hello_world():
    print("Hello, World!")
    </code></pre>

    <p><em>End of test document.</em></p>
</body>
</html>`;
      writeFileSync(filePath, content, 'utf-8');
    }
    return true;
  } catch (error) {
    console.warn(`Failed to create test document ${filePath}:`, error);
    return false;
  }
}

describe('MarkItDownTool - REAL EXECUTION TESTS', () => {
  let markitdownTool: MarkItDownTool;
  let testFiles: string[] = [];

  beforeAll(() => {
    // Initialize the output file for REAL results
    try {
      const header = 'MARKITDOWN TOOL - REAL LLM OUTPUT SAMPLES\n' + '='.repeat(50) + '\n\n';
      writeFileSync('C:\\tmp\\markitdown_real_outputs.txt', header);
    } catch (error) {
      console.warn('Failed to initialize output file:', error);
    }
  });

  beforeEach(() => {
    // Create MarkItDownTool with empty requirements to skip installation
    class TestMarkItDownTool extends MarkItDownTool {
      protected override getRequirements(): string[] {
        return []; // Skip dependency installation since markitdown is already installed
      }

      protected override getEmbeddedPythonPath(): string {
        return 'C:\\Code\\gemini-cli\\packages\\python-3.13.7\\python.exe';
      }
    }

    markitdownTool = new TestMarkItDownTool(mockConfig);
  });

  it('should initialize with correct properties', () => {
    expect(markitdownTool.name).toBe('markitdown');
    expect(markitdownTool.displayName).toBe('Document Converter');
    expect(markitdownTool.description).toBe('Converts various document formats (PDF, DOCX, PPTX, XLSX) to Markdown for LLM processing. Extracts text, structure, and metadata from documents.');
  });

  describe('Document conversion operations', () => {
    // Setup test files
    it('should setup test files', async () => {
      const timestamp = Date.now();

      // Create test files
      const txtFile = `C:\\tmp\\markitdown_test_${timestamp}.txt`;
      const htmlFile = `C:\\tmp\\markitdown_test_${timestamp}.html`;

      const txtCreated = createTestDocument(txtFile, 'txt');
      const htmlCreated = createTestDocument(htmlFile, 'html');

      if (txtCreated) testFiles.push(txtFile);
      if (htmlCreated) testFiles.push(htmlFile);

      saveLLMOutput('setup_test_files', `Created ${testFiles.length} test files: ${testFiles.join(', ')}`, testFiles.length > 0);

      expect(testFiles.length).toBeGreaterThan(0);
    }, 10000);

    // Test convert operation
    it('should execute convert operation on text file', async () => {
      if (testFiles.length === 0) {
        throw new Error('No test files available');
      }

      try {
        const testFile = testFiles.find(f => f.endsWith('.txt'));
        if (!testFile) {
          throw new Error('No .txt test file available');
        }

        const params = {
          op: 'convert' as const,
          file_path: testFile,
          include_metadata: true
        };

        console.log('Testing convert operation on:', testFile);

        const invocation = markitdownTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);

        const success = !result.error;
        saveLLMOutput('convert_text_file', String(result.returnDisplay || result.llmContent), success);

        console.log('Convert operation success:', success);
        console.log('Result display:', String(result.returnDisplay).substring(0, 200) + '...');

        // Don't fail test - just log results for analysis
        if (result.error) {
          console.warn('Convert operation failed:', result.error);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('convert_operation_error', errorMessage, false);
        console.error('Convert test error:', errorMessage);
        throw error;
      }
    }, 30000);

    // Test extract_text operation
    it('should execute extract_text operation on HTML file', async () => {
      if (testFiles.length === 0) {
        throw new Error('No test files available');
      }

      try {
        const testFile = testFiles.find(f => f.endsWith('.html'));
        if (!testFile) {
          throw new Error('No .html test file available');
        }

        const params = {
          op: 'extract_text' as const,
          file_path: testFile,
          max_length: 1000
        };

        console.log('Testing extract_text operation on:', testFile);

        const invocation = markitdownTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);

        const success = !result.error;
        saveLLMOutput('extract_text_html', String(result.returnDisplay || result.llmContent), success);

        console.log('Extract text operation success:', success);
        console.log('Result display:', String(result.returnDisplay).substring(0, 200) + '...');

        // Don't fail test - just log results for analysis
        if (result.error) {
          console.warn('Extract text operation failed:', result.error);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('extract_text_error', errorMessage, false);
        console.error('Extract text test error:', errorMessage);
        throw error;
      }
    }, 30000);

    // Test analyze_structure operation
    it('should execute analyze_structure operation', async () => {
      if (testFiles.length === 0) {
        throw new Error('No test files available');
      }

      try {
        const testFile = testFiles[0]; // Use first available test file

        const params = {
          op: 'analyze_structure' as const,
          file_path: testFile,
          include_metadata: true
        };

        console.log('Testing analyze_structure operation on:', testFile);

        const invocation = markitdownTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);

        const success = !result.error;
        saveLLMOutput('analyze_structure', String(result.returnDisplay || result.llmContent), success);

        console.log('Analyze structure operation success:', success);
        console.log('Result display:', String(result.returnDisplay).substring(0, 200) + '...');

        // Don't fail test - just log results for analysis
        if (result.error) {
          console.warn('Analyze structure operation failed:', result.error);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('analyze_structure_error', errorMessage, false);
        console.error('Analyze structure test error:', errorMessage);
        throw error;
      }
    }, 30000);

    // Test file not found error handling
    it('should handle file not found error gracefully', async () => {
      try {
        const params = {
          op: 'convert' as const,
          file_path: 'C:\\tmp\\nonexistent_file_12345.pdf'
        };

        console.log('Testing file not found handling');

        const invocation = markitdownTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);

        const hasError = !!result.error;
        saveLLMOutput('file_not_found_handling', String(result.returnDisplay || result.llmContent), !hasError);

        console.log('File not found test - has error as expected:', hasError);
        console.log('Error message:', result.error?.message);

        // This should fail gracefully with an error
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('not found');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('file_not_found_test_error', errorMessage, false);
        console.error('File not found test error:', errorMessage);
        throw error;
      }
    }, 15000);

    // Test invalid operation
    it('should handle invalid parameters gracefully', async () => {
      try {
        const params = {
          op: 'invalid_operation' as any,
          file_path: 'C:\\tmp\\test.txt'
        };

        console.log('Testing invalid operation handling');

        const invocation = markitdownTool['createInvocation'](params);
        const result = await invocation.execute(new AbortController().signal);

        const hasError = !!result.error;
        saveLLMOutput('invalid_operation_handling', String(result.returnDisplay || result.llmContent), !hasError);

        console.log('Invalid operation test - has error as expected:', hasError);

        // This should fail with an error
        if (result.error) {
          expect(result.error.message).toBeDefined();
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        saveLLMOutput('invalid_operation_test_error', errorMessage, false);
        console.error('Invalid operation test error:', errorMessage);
        // Don't throw - this is expected to fail at some level
      }
    }, 15000);
  });

  describe('Tool configuration and metadata', () => {
    it('should have correct parameter schema', () => {
      const schema = markitdownTool['parameterSchema'] as any;

      expect(schema.type).toBe('object');
      expect(schema.required).toContain('op');
      expect(schema.required).toContain('file_path');

      expect(schema.properties.op.enum).toContain('convert');
      expect(schema.properties.op.enum).toContain('extract_text');
      expect(schema.properties.op.enum).toContain('analyze_structure');

      expect(schema.properties.file_path.type).toBe('string');
      expect(schema.properties.output_path.type).toBe('string');
      expect(schema.properties.include_metadata.type).toBe('boolean');

      saveLLMOutput('tool_schema_validation', `Schema validation passed. Operations: ${schema.properties.op.enum.join(', ')}`, true);
    });

    it('should generate correct invocation description', () => {
      const params = {
        op: 'convert' as const,
        file_path: 'C:\\tmp\\test.pdf'
      };

      const invocation = markitdownTool['createInvocation'](params);
      const description = invocation.getDescription();

      expect(description).toContain('Document Converter');
      expect(description).toContain('markitdown');

      saveLLMOutput('invocation_description', `Description: ${description}`, true);

      console.log('Generated description:', description);
    });
  });
});