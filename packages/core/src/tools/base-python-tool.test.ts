/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BasePythonTool } from './base-python-tool.js';
import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';

// Mock the config
const mockConfig: Config = {
  getTargetDir: () => '/test/dir',
} as Config;

// Create a concrete test implementation of BasePythonTool
interface TestParams {
  message: string;
  count: number;
}

interface TestResult extends ToolResult {
  success: boolean;
  processedMessage: string;
  processedCount: number;
}

class TestPythonTool extends BasePythonTool<TestParams, TestResult> {
  constructor(config: Config) {
    super(
      'test-python',
      'Test Python Tool',
      'A test implementation of BasePythonTool',
      ['requests'], // test requirements
      {
        type: 'object',
        required: ['message', 'count'],
        properties: {
          message: { type: 'string', description: 'Test message' },
          count: { type: 'number', description: 'Test count' },
        },
      },
      config,
    );
  }

  protected generatePythonCode(params: TestParams): string {
    return `
import json

def test_function():
    message = "${params.message}"
    count = ${params.count}
    
    result = {
        "success": True,
        "processedMessage": message.upper(),
        "processedCount": count * 2
    }
    
    print("=== TEST_RESULT_START ===")
    print(json.dumps(result))
    print("=== TEST_RESULT_END ===")

if __name__ == "__main__":
    test_function()
`;
  }

  protected parseResult(pythonOutput: string, params: TestParams): TestResult {
    try {
      const startMarker = '=== TEST_RESULT_START ===';
      const endMarker = '=== TEST_RESULT_END ===';
      
      const startIndex = pythonOutput.indexOf(startMarker);
      const endIndex = pythonOutput.indexOf(endMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const jsonStr = pythonOutput.substring(
          startIndex + startMarker.length,
          endIndex
        ).trim();
        
        const parsedResult = JSON.parse(jsonStr);
        
        return {
          llmContent: `Processed: ${parsedResult.processedMessage}`,
          returnDisplay: `✅ Test completed: ${parsedResult.processedMessage} (${parsedResult.processedCount})`,
          success: parsedResult.success,
          processedMessage: parsedResult.processedMessage,
          processedCount: parsedResult.processedCount,
        };
      }
      
      return {
        success: false,
        processedMessage: '',
        processedCount: 0,
        llmContent: pythonOutput,
        returnDisplay: '⚠️ Could not parse test result',
      };
      
    } catch (error) {
      return {
        success: false,
        processedMessage: '',
        processedCount: 0,
        llmContent: `Parsing error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `❌ Failed to parse test result`,
      };
    }
  }
}

describe('BasePythonTool', () => {
  let testTool: TestPythonTool;

  beforeEach(() => {
    testTool = new TestPythonTool(mockConfig);
  });

  it('should initialize with correct properties', () => {
    expect(testTool.name).toBe('test-python');
    expect(testTool.displayName).toBe('Test Python Tool');
    expect(testTool.description).toBe('A test implementation of BasePythonTool');
  });

  it('should create invocation with correct parameters', () => {
    const params = {
      message: 'hello',
      count: 5,
    };

    const invocation = testTool['createInvocation'](params);
    
    expect(invocation).toBeDefined();
    expect(invocation.params).toEqual(params);
  });

  it('should generate correct Python code', () => {
    const params = {
      message: 'test message',
      count: 3,
    };

    const pythonCode = testTool['generatePythonCode'](params);

    expect(pythonCode).toContain('message = "test message"');
    expect(pythonCode).toContain('count = 3');
    expect(pythonCode).toContain('import json');
    expect(pythonCode).toContain('TEST_RESULT_START');
    expect(pythonCode).toContain('TEST_RESULT_END');
  });

  it('should parse successful result correctly', () => {
    const mockPythonOutput = `
Some initial output
=== TEST_RESULT_START ===
{
  "success": true,
  "processedMessage": "HELLO WORLD",
  "processedCount": 10
}
=== TEST_RESULT_END ===
Final output
`;

    const params = {
      message: 'hello world',
      count: 5,
    };

    const result = testTool['parseResult'](mockPythonOutput, params);

    expect(result.success).toBe(true);
    expect(result.processedMessage).toBe('HELLO WORLD');
    expect(result.processedCount).toBe(10);
    expect(result.llmContent).toContain('HELLO WORLD');
    expect(result.returnDisplay).toContain('✅');
  });

  it('should handle parsing errors gracefully', () => {
    const mockPythonOutput = `
Some output without proper markers
This is not valid JSON
`;

    const params = {
      message: 'test',
      count: 1,
    };

    const result = testTool['parseResult'](mockPythonOutput, params);

    expect(result.success).toBe(false);
    expect(result.returnDisplay).toContain('⚠️');
    expect(result.llmContent).toBe(mockPythonOutput);
  });

  it('should handle malformed JSON gracefully', () => {
    const mockPythonOutput = `
=== TEST_RESULT_START ===
{ invalid json structure
=== TEST_RESULT_END ===
`;

    const params = {
      message: 'test',
      count: 1,
    };

    const result = testTool['parseResult'](mockPythonOutput, params);

    expect(result.success).toBe(false);
    expect(result.returnDisplay).toContain('❌');
    expect(result.returnDisplay).toContain('parse');
  });

  // Integration test - this tests the full execution path
  it('should handle integration test correctly', async () => {
    const params = {
      message: 'integration test',
      count: 10,
    };

    const invocation = testTool['createInvocation'](params);
    const result = await invocation.execute(new AbortController().signal);

    // Since we don't have embedded Python in test environment, 
    // we expect a "Python not found" error
    expect(result.llmContent).toContain('Embedded Python not found');
    expect(result.returnDisplay).toContain('❌');
  });

  it('should handle execution errors gracefully', async () => {
    const params = {
      message: 'error test',
      count: 1,
    };

    const invocation = testTool['createInvocation'](params);
    const result = await invocation.execute(new AbortController().signal);

    // In test environment without embedded Python, we expect a "not found" error
    expect(result.llmContent).toContain('Embedded Python not found');
    expect(result.returnDisplay).toContain('❌');
  });

  it('should provide confirmation details correctly', async () => {
    const params = {
      message: 'confirmation test',
      count: 1,
    };

    const invocation = testTool['createInvocation'](params);
    const confirmationDetails = await invocation.shouldConfirmExecute(new AbortController().signal);

    expect(confirmationDetails).toBeDefined();
    expect(confirmationDetails).toHaveProperty('type', 'exec');
    expect(confirmationDetails).toHaveProperty('title');
    expect((confirmationDetails as any).title).toContain('Test Python Tool');
  });

  it('should provide correct description', () => {
    const params = {
      message: 'description test',
      count: 42,
    };

    const invocation = testTool['createInvocation'](params);
    const description = invocation.getDescription();

    expect(description).toContain('Test Python Tool');
    expect(description).toContain('Execute Python code for');
  });
});