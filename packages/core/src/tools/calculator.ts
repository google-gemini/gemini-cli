import { evaluate } from 'mathjs';
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
 * @param expression The mathematical expression to evaluate.
 * @returns The result of the evaluation as a string, or an error message.
 */
export function calculator(expression: string): string {
  try {
    // Prevent abuse with extremely long input
    if (expression.length > 200) {
      return 'Expression too long.';
    }

    const result = evaluate(expression);
    return String(result);
  } catch {
    return 'Invalid mathematical expression.';
  }
}
