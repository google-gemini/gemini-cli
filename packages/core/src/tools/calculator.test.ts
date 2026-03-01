import { describe, expect, test } from 'vitest';
import { calculator, CalculatorTool } from './calculator.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';

describe('Calculator', () => {
  describe('standalone function', () => {
    test('simple addition', () => {
      expect(calculator('2+2')).toBe('4');
    });

    test('multiplication', () => {
      expect(calculator('10*5')).toBe('50');
    });

    test('complex expression', () => {
      expect(calculator('(10+5)/3')).toBe('5');
    });

    test('invalid expression', () => {
      expect(calculator('2 + * 3')).toBe('Invalid mathematical expression.');
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
