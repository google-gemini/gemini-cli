/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildForumSynthesisInjection } from './useForumMode.js';

describe('buildForumSynthesisInjection', () => {
  it('wraps the synthesis body in tagged blocks with preset and author', () => {
    const message = buildForumSynthesisInjection('review', {
      kind: 'final',
      memberId: 'lead',
      label: 'Hegel (Lead)',
      text: 'Verdict: Approve.',
      timestamp: 0,
    });

    expect(message.role).toBe('user');
    expect(message.parts).toHaveLength(1);
    const text = message.parts[0].text;
    expect(text).toContain(
      '<forum_synthesis preset="review" by="Hegel (Lead)">',
    );
    expect(text).toContain(
      '<forum_synthesis_body>\nVerdict: Approve.\n</forum_synthesis_body>',
    );
    expect(text).toContain('</forum_synthesis>');
    expect(text).not.toContain('<forum_task>');
  });

  it('embeds the original task in a forum_task block when provided', () => {
    const message = buildForumSynthesisInjection(
      'review',
      {
        kind: 'final',
        memberId: 'lead',
        label: 'Hegel (Lead)',
        text: 'Verdict: Approve.',
        timestamp: 0,
      },
      'review changes on this branch',
    );

    const text = message.parts[0].text;
    expect(text).toContain(
      '<forum_task>\nreview changes on this branch\n</forum_task>',
    );
    expect(text).toContain(
      '<forum_synthesis_body>\nVerdict: Approve.\n</forum_synthesis_body>',
    );
    // Task block must precede the synthesis body so the agent reads them in order.
    expect(text.indexOf('<forum_task>')).toBeLessThan(
      text.indexOf('<forum_synthesis_body>'),
    );
  });

  it('preserves multiline synthesis bodies verbatim', () => {
    const body =
      '## Verdict\n\nApprove with nits.\n\n## Findings\n- one\n- two';
    const message = buildForumSynthesisInjection('design', {
      kind: 'final',
      memberId: 'lead',
      label: 'Aristotle (Lead)',
      text: body,
      timestamp: 0,
    });

    expect(message.parts[0].text).toContain(body);
    expect(message.parts[0].text.startsWith('<forum_synthesis')).toBe(true);
    expect(message.parts[0].text.endsWith('</forum_synthesis>')).toBe(true);
  });
});
