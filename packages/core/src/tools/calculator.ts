/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CALCULATOR_TOOL_NAME } from './definitions/base-declarations.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

export interface CalculatorParams extends Record<string, unknown> {
  expression: string;
}

/**
 * Tool for evaluating mathematical expressions.
 */
export class CalculatorTool extends BaseDeclarativeTool<
  CalculatorParams,
  ToolResult
> {
  static readonly Name = CALCULATOR_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      CalculatorTool.Name,
      'Calculator',
      'Evaluates mathematical expressions deterministically.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The mathematical expression to evaluate.',
          },
        },
        required: ['expression'],
      },
      messageBus,
    );
  }

  protected override createInvocation(
    params: CalculatorParams,
    messageBus: MessageBus,
  ): CalculatorInvocation {
    return new CalculatorInvocation(params, messageBus, this.name);
  }
}

class CalculatorInvocation extends BaseToolInvocation<
  CalculatorParams,
  ToolResult
> {
  getDescription(): string {
    return `Calculating: ${this.params.expression}`;
  }

  async execute(): Promise<ToolResult> {
    const result = calculator(this.params.expression);
    return {
      llmContent: result,
      returnDisplay: result,
    };
  }
}

/**
 * Evaluates a mathematical expression deterministically.
 * Supports +, -, *, /, ^, %, and parentheses.
 * @param expression The mathematical expression to evaluate.
 * @returns The result of the evaluation as a string, or an error message.
 */
export function calculator(expression: string): string {
  try {
    // Prevent abuse with extremely long input
    if (expression.length > 200) {
      return 'Expression too long.';
    }

    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return 'Invalid mathematical expression.';
    }

    let pos = 0;

    function parseExpression(): number {
      let left = parseTerm();
      while (
        pos < tokens.length &&
        (tokens[pos] === '+' || tokens[pos] === '-')
      ) {
        const op = tokens[pos++];
        const right = parseTerm();
        if (op === '+') left += right;
        else left -= right;
      }
      return left;
    }

    function parseTerm(): number {
      let left = parseFactor();
      while (
        pos < tokens.length &&
        (tokens[pos] === '*' || tokens[pos] === '/' || tokens[pos] === '%')
      ) {
        const op = tokens[pos++];
        const right = parseFactor();
        if (op === '*') left *= right;
        else if (op === '/') {
          if (right === 0) throw new Error('Division by zero');
          left /= right;
        } else if (op === '%') {
          if (right === 0) throw new Error('Modulo by zero');
          left %= right;
        }
      }
      return left;
    }

    function parseFactor(): number {
      let left = parsePower();
      while (pos < tokens.length && tokens[pos] === '^') {
        pos++;
        const right = parseFactor(); // Right-associative exponentiation
        left = Math.pow(left, right);
      }
      return left;
    }

    function parsePower(): number {
      if (pos >= tokens.length) throw new Error('Unexpected end of expression');

      if (tokens[pos] === '-') {
        pos++;
        return -parsePower();
      }
      if (tokens[pos] === '+') {
        pos++;
        return parsePower();
      }

      if (tokens[pos] === '(') {
        pos++;
        const res = parseExpression();
        if (pos >= tokens.length || tokens[pos] !== ')') {
          throw new Error('Missing closing parenthesis');
        }
        pos++;
        return res;
      }

      const val = parseFloat(tokens[pos++]);
      if (isNaN(val)) throw new Error('Not a number');
      return val;
    }

    const result = parseExpression();
    if (pos < tokens.length) {
      throw new Error('Unexpected tokens at end');
    }

    // Format result to avoid scientific notation for simple numbers
    // but keep enough precision.
    return Number.isFinite(result)
      ? String(Number(result.toFixed(10)))
      : String(result);
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'Expression too long' ||
        e.message === 'Division by zero' ||
        e.message === 'Modulo by zero')
    ) {
      return e.message + '.';
    }
    return 'Invalid mathematical expression.';
  }
}

function tokenize(str: string): string[] {
  const result: string[] = [];
  const regex = /\d+(\.\d+)?|[+\-*/%^()]/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    result.push(m[0]);
  }
  return result;
}
