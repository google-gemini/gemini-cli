/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TopicMessage } from './TopicMessage.js';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  TOPIC_PARAM_TITLE,
  TOPIC_PARAM_SUMMARY,
  TOPIC_PARAM_STRATEGIC_INTENT,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';

describe('<TopicMessage />', () => {
  const baseArgs = {
    [TOPIC_PARAM_TITLE]: 'Test Topic',
    [TOPIC_PARAM_STRATEGIC_INTENT]: 'This is the strategic intent.',
    [TOPIC_PARAM_SUMMARY]:
      'This is the detailed summary that should be expandable.',
  };

  const renderTopic = async (args: Record<string, unknown>, height?: number) =>
    renderWithProviders(
      <TopicMessage
        args={args}
        terminalWidth={80}
        availableTerminalHeight={height}
        callId="test-topic"
        name="update_topic"
        description="Updating topic"
        status={CoreToolCallStatus.Success}
        confirmationDetails={undefined}
        resultDisplay={undefined}
      />,
    );

  it('renders title and intent by default (collapsed)', async () => {
    const { lastFrame } = await renderTopic(baseArgs, 40);
    const frame = lastFrame();
    expect(frame).toContain('Test Topic:');
    expect(frame).toContain('This is the strategic intent.');
    expect(frame).not.toContain('This is the detailed summary');
    expect(frame).toContain('(ctrl+o to expand)');
  });

  it('renders summary when expanded', async () => {
    const { lastFrame } = await renderTopic(baseArgs, undefined);
    const frame = lastFrame();
    expect(frame).toContain('Test Topic:');
    expect(frame).toContain('This is the strategic intent.');
    expect(frame).toContain('This is the detailed summary');
    expect(frame).toContain('(ctrl+o to collapse)');
  });

  it('falls back to summary if strategic_intent is missing', async () => {
    const args = {
      [TOPIC_PARAM_TITLE]: 'Test Topic',
      [TOPIC_PARAM_SUMMARY]: 'Only summary is present.',
    };
    const { lastFrame } = await renderTopic(args, 40);
    const frame = lastFrame();
    expect(frame).toContain('Test Topic:');
    expect(frame).toContain('Only summary is present.');
    expect(frame).not.toContain('(ctrl+o to expand)');
  });

  it('renders only strategic_intent if summary is missing', async () => {
    const args = {
      [TOPIC_PARAM_TITLE]: 'Test Topic',
      [TOPIC_PARAM_STRATEGIC_INTENT]: 'Only intent is present.',
    };
    const { lastFrame } = await renderTopic(args, 40);
    const frame = lastFrame();
    expect(frame).toContain('Test Topic:');
    expect(frame).toContain('Only intent is present.');
    expect(frame).not.toContain('(ctrl+o to expand)');
  });

  it('renders title only if both intent and summary are missing', async () => {
    const args = {
      [TOPIC_PARAM_TITLE]: 'Test Topic',
    };
    const { lastFrame } = await renderTopic(args, 40);
    const frame = lastFrame();
    expect(frame).toContain('Test Topic');
    expect(frame).not.toContain(':');
    expect(frame).not.toContain('(ctrl+o to expand)');
  });
});
