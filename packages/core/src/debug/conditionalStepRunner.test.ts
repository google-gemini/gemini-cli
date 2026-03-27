/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ConditionalStepRunner } from './conditionalStepRunner.js';
import type { ExpressionEvaluator, StepController } from './conditionalStepRunner.js';

function createMockEvaluator(values: string[]): ExpressionEvaluator {
    let callIndex = 0;
    return {
        evaluate: vi.fn(async () => {
            const val = values[callIndex] ?? values[values.length - 1];
            callIndex++;
            return { result: val, type: 'string' };
        }),
    };
}

function createMockStepper(): StepController {
    return {
        step: vi.fn(async () => undefined),
        waitForStop: vi.fn(async () => ({ reason: 'step', threadId: 1 })),
    };
}

describe('ConditionalStepRunner', () => {
    const runner = new ConditionalStepRunner(50, 30000);

    describe('run', () => {
        it('should stop immediately if condition is already true', async () => {
            const evaluator = createMockEvaluator(['true']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'x > 0',
            });

            expect(result.conditionMet).toBe(true);
            expect(result.stepsTaken).toBe(0);
            expect(result.reason).toBe('condition-met');
        });

        it('should step until condition becomes true', async () => {
            const evaluator = createMockEvaluator(['false', 'false', 'true']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'counter > 5',
            });

            expect(result.conditionMet).toBe(true);
            expect(result.stepsTaken).toBe(2);
            expect(result.reason).toBe('condition-met');
        });

        it('should stop at max steps', async () => {
            const evaluator = createMockEvaluator(['false']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'never_true',
                maxSteps: 5,
            });

            expect(result.conditionMet).toBe(false);
            expect(result.stepsTaken).toBe(5);
            expect(result.reason).toBe('max-steps');
        });

        it('should handle evaluation errors', async () => {
            const evaluator: ExpressionEvaluator = {
                evaluate: vi.fn(async () => {
                    throw new Error('Debugger disconnected');
                }),
            };
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'x',
            });

            // Initial check returns <error>, which is falsy
            // Then first step + eval throws again → error
            expect(result.conditionMet).toBe(false);
        });

        it('should track condition history', async () => {
            const evaluator = createMockEvaluator(['0', '5', '10', '15']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'counter',
                maxSteps: 10,
            });

            expect(result.conditionHistory.length).toBeGreaterThan(0);
            expect(result.conditionHistory[0].step).toBe(0);
            expect(result.conditionHistory[0].value).toBe('0');
        });

        it('should treat "false", "0", "null" as falsy', async () => {
            const evaluator = createMockEvaluator(['false', '0', 'null', 'undefined', '1']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'val',
            });

            expect(result.conditionMet).toBe(true);
            expect(result.stepsTaken).toBe(4); // skipped false, 0, null, undefined
        });
    });

    describe('toMarkdown', () => {
        it('should show success message when condition met', async () => {
            const evaluator = createMockEvaluator(['false', 'true']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, { condition: 'x > 0' });
            const md = runner.toMarkdown(result, 'x > 0');

            expect(md).toContain('✅');
            expect(md).toContain('x > 0');
            expect(md).toContain('Step');
        });

        it('should show failure message when max steps hit', async () => {
            const evaluator = createMockEvaluator(['false']);
            const stepper = createMockStepper();

            const result = await runner.run(evaluator, stepper, {
                condition: 'never',
                maxSteps: 3,
            });
            const md = runner.toMarkdown(result, 'never');

            expect(md).toContain('❌');
            expect(md).toContain('max-steps');
        });
    });
});
