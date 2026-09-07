/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsciiBox, type BoxStyle } from './AsciiBox.js';

export interface FlowStep {
  title: string;
  description?: string;
}

export class FlowVisualizer {
  public static renderPipeline(stages: string[], style: BoxStyle = 'rounded'): string {
    if (stages.length === 0) return '';
    if (stages.length === 1) {
      return AsciiBox.create(stages[0], { style, align: 'center' });
    }

    let combined = AsciiBox.create(stages[0], { style, align: 'center' });
    for (let i = 1; i < stages.length; i++) {
      const nextBox = AsciiBox.create(stages[i], { style, align: 'center' });
      combined = AsciiBox.horizontalConnect(combined, '──►', nextBox);
    }
    return combined;
  }

  public static renderVerticalFlow(steps: FlowStep[], style: BoxStyle = 'rounded'): string {
    if (steps.length === 0) return '';

    const blocks: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const lines = [step.title];
      if (step.description) {
        lines.push(step.description);
      }
      const box = AsciiBox.create(lines, { style, align: 'center', minWidth: 26 });
      blocks.push(box);

      if (i < steps.length - 1) {
        // Add centered down-arrow
        blocks.push('           │\n           ▼');
      }
    }

    return blocks.join('\n');
  }

  public static renderBidirectional(left: string, right: string, label?: string, style: BoxStyle = 'rounded'): string {
    const leftBox = AsciiBox.create(left, { style, align: 'center' });
    const rightBox = AsciiBox.create(right, { style, align: 'center' });
    const arrow = label ? `◄──[ ${label} ]──►` : '◄──►';
    return AsciiBox.horizontalConnect(leftBox, arrow, rightBox);
  }
}
