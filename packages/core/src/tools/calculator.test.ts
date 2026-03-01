/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, test } from 'vitest';
import { calculator, CalculatorTool } from './calculator.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('Calculator', () => {
  describe('standalone function', () => {
    test('simple addition', () => {
      expect(calculator('2+2')).toBe('4');
    });

    test('multiplication', () => {
      expect(calculator('10*5')).toBe('50');
    });

    test('division', () => {
      expect(calculator('10/2')).toBe('5');
    });

    test('modulo', () => {
      expect(calculator('10%3')).toBe('1');
    });

    test('exponentiation', () => {
      expect(calculator('2^3')).toBe('8');
    });

    test('complex expression', () => {
      expect(calculator('(10+5)/3')).toBe('5');
      expect(calculator('2 + 3 * 4')).toBe('14');
      expect(calculator('(2 + 3) * 4')).toBe('20');
      expect(calculator('2 ^ 3 ^ 2')).toBe('512'); // Right-associative
    });

    test('negative numbers', () => {
      expect(calculator('-5 + 3')).toBe('-2');
      expect(calculator('10 + -2')).toBe('8');
    });

    test('decimal numbers', () => {
      expect(calculator('2.5 * 2')).toBe('5');
      expect(calculator('1 / 3')).toBe('0.3333333333');
    });

    test('division by zero', () => {
      expect(calculator('10/0')).toBe('Division by zero.');
    });

    test('modulo by zero', () => {
      expect(calculator('10%0')).toBe('Modulo by zero.');
    });

    test('invalid expression', () => {
      expect(calculator('2 + * 3')).toBe('Invalid mathematical expression.');
      expect(calculator('import("fs")')).toBe(
        'Invalid mathematical expression.',
      );
      expect(calculator('2(3)')).toBe('Invalid mathematical expression.');
      expect(calculator('((1+2)')).toBe('Invalid mathematical expression.');
    });

    test('too long expression', () => {
      const longInput = '1+'.repeat(300);
      expect(calculator(longInput)).toBe('Expression too long.');
    });
  });

  describe('CalculatorTool', () => {
    const mockMessageBus = {} as MessageBus;
    const tool = new CalculatorTool(mockMessageBus);

    test('tool properties', () => {
      expect(tool.name).toBe('calculator');
      expect(tool.displayName).toBe('Calculator');
    });

    test('execution via invocation', async () => {
      const invocation = tool.build({ expression: '5 * 5' });
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toBe('25');
      expect(result.returnDisplay).toBe('25');
    });
  });
});
