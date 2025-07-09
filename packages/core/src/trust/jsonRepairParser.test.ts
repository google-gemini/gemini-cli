/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JsonRepairParser } from './jsonRepairParser.js';

describe('JsonRepairParser', () => {
  let parser: JsonRepairParser;

  beforeEach(() => {
    parser = new JsonRepairParser();
  });

  describe('parseFunctionCalls', () => {
    it('should parse valid JSON function calls', () => {
      const text = '{"function_call": {"name": "list_directory", "arguments": {"path": "/tmp"}}}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
      expect(result.functionCalls[0].name).toBe('list_directory');
      expect(result.functionCalls[0].args).toEqual({ path: '/tmp' });
    });

    it('should parse function calls in code blocks', () => {
      const text = '```json\n{"function_call": {"name": "read_file", "arguments": {"file": "test.txt"}}}\n```';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
      expect(result.functionCalls[0].name).toBe('read_file');
    });

    it('should fix missing quotes on keys', () => {
      const text = '{function_call: {"name": "test", "arguments": {}}}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
      expect(result.repairedJson).toBeDefined();
    });

    it('should fix trailing commas', () => {
      const text = '{"function_call": {"name": "test", "arguments": {"key": "value",}}}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
    });

    it('should fix single quotes', () => {
      const text = "{'function_call': {'name': 'test', 'arguments': {}}}";
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
    });

    it('should handle alternative format without function_call wrapper', () => {
      const text = '{"name": "list_directory", "arguments": {"path": "/home"}}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
      expect(result.functionCalls[0].name).toBe('list_directory');
    });

    it('should extract function calls from surrounding text', () => {
      const text = 'Here is the function call: {"function_call": {"name": "test", "arguments": {}}} and some more text';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
    });

    it('should handle missing commas between properties', () => {
      const text = '{"function_call": {"name": "test" "arguments": {}}}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
    });

    it('should extract from informal patterns', () => {
      const text = 'Execute tool: read_file with arguments: {"file": "config.json"}';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(true);
      expect(result.functionCalls).toHaveLength(1);
      expect(result.functionCalls[0].name).toBe('read_file');
      expect(result.functionCalls[0].args).toEqual({ file: 'config.json' });
    });

    it('should handle completely malformed JSON gracefully', () => {
      const text = 'This is not JSON at all';
      const result = parser.parseFunctionCalls(text);
      
      expect(result.success).toBe(false);
      expect(result.functionCalls).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('validateFunctionCall', () => {
    it('should validate correct function calls', () => {
      const call = {
        name: 'test',
        args: { key: 'value' },
        id: 'call_123'
      };
      
      const errors = parser.validateFunctionCall(call);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing name', () => {
      const call = {
        name: '',
        args: {},
        id: 'call_123'
      };
      
      const errors = parser.validateFunctionCall(call);
      expect(errors).toContain('Function name must be a non-empty string');
    });

    it('should detect invalid arguments', () => {
      const call = {
        name: 'test',
        args: null as any,
        id: 'call_123'
      };
      
      const errors = parser.validateFunctionCall(call);
      expect(errors).toContain('Function arguments must be an object');
    });

    it('should detect missing ID', () => {
      const call = {
        name: 'test',
        args: {},
        id: ''
      };
      
      const errors = parser.validateFunctionCall(call);
      expect(errors).toContain('Function call must have an ID');
    });
  });
});