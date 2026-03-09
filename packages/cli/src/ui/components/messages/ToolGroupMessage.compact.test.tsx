
import { renderWithProviders } from '../../../test-utils/render.js';
import { ToolGroupMessage } from './ToolGroupMessage.js';
import {
  CoreToolCallStatus,
  LS_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
} from '@google/gemini-cli-core';
import { expect, it, describe } from 'vitest';

describe('ToolGroupMessage Compact Rendering', () => {
  const defaultProps = {
    item: { 
      id: '1', 
      role: 'assistant', 
      content: '', 
      timestamp: new Date(),
      type: 'help' as const, // Adding type property to satisfy HistoryItem type
    },
    terminalWidth: 80,
  };

  const compactSettings = {
    merged: {
      ui: {
        compactToolOutput: true,
      },
    },
  };

  it('renders consecutive compact tools without empty lines between them', async () => {
    const toolCalls = [
      {
        callId: 'call1',
        name: LS_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: 'file1.txt\nfile2.txt',
      },
      {
        callId: 'call2',
        name: LS_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: 'file3.txt',
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolGroupMessage {...defaultProps} toolCalls={toolCalls as any} />,
      { settings: compactSettings as any }
    );

    await waitUntilReady();
    const output = lastFrame();
    
    expect(output).toMatchSnapshot();
  });

  it('does not add an extra empty line between a compact tool and a standard tool', async () => {
    const toolCalls = [
      {
        callId: 'call1',
        name: LS_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: 'file1.txt',
      },
      {
        callId: 'call2',
        name: 'non-compact-tool',
        status: CoreToolCallStatus.Success,
        resultDisplay: 'some large output',
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolGroupMessage {...defaultProps} toolCalls={toolCalls as any} />,
      { settings: compactSettings as any }
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  it('does not add an extra empty line if a compact tool has a dense payload', async () => {
    const toolCalls = [
      {
        callId: 'call1',
        name: LS_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: 'file1.txt',
      },
      {
        callId: 'call2',
        name: READ_FILE_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: { summary: 'read file', payload: 'file content' }, // Dense payload
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolGroupMessage {...defaultProps} toolCalls={toolCalls as any} />,
      { settings: compactSettings as any }
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });

  it('does not add an extra empty line between a standard tool and a compact tool', async () => {
    const toolCalls = [
      {
        callId: 'call1',
        name: 'non-compact-tool',
        status: CoreToolCallStatus.Success,
        resultDisplay: 'some large output',
      },
      {
        callId: 'call2',
        name: LS_DISPLAY_NAME,
        status: CoreToolCallStatus.Success,
        resultDisplay: 'file1.txt',
      },
    ];

    const { lastFrame, waitUntilReady } = renderWithProviders(
      <ToolGroupMessage {...defaultProps} toolCalls={toolCalls as any} />,
      { settings: compactSettings as any }
    );

    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatchSnapshot();
  });
});
