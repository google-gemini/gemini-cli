/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('ProQuotaDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with correct title and options', () => {
    const { lastFrame, unmount } = render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={false}
        hasVertexAI={false}
        onChoice={() => {}}
      />,
    );

    const output = lastFrame();
    expect(output).toContain(
      'Note: You can always use /model to select a different option.',
    );

    // Check that RadioButtonSelect was called with the correct items
    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Try again later',
            value: 'retry_later' as const,
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry' as const,
            key: 'retry',
          },
        ],
      }),
      undefined,
    );
    unmount();
  });

  it('should call onChoice with "retry_later" when "Try again later" is selected', () => {
    const mockOnChoice = vi.fn();
    const { unmount } = render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={false}
        hasVertexAI={false}
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('retry_later');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('retry_later');
    unmount();
  });

  it('should call onChoice with "retry" when "Switch to flash" is selected', () => {
    const mockOnChoice = vi.fn();
    const { unmount } = render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={false}
        hasVertexAI={false}
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('retry');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('retry');
    unmount();
  });

  it('should show Gemini API key fallback option when hasApiKey is true', () => {
    render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={true}
        hasVertexAI={false}
        onChoice={() => {}}
      />,
    );

    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          {
            label: 'Try again later',
            value: 'retry_later',
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry',
            key: 'retry',
          },
          {
            label: 'Always fallback to Gemini API key',
            value: 'gemini-api-key',
            key: 'gemini-api-key',
          },
        ]),
      }),
      undefined,
    );
  });

  it('should call onChoice with "gemini-api-key" when Gemini API key option is selected', () => {
    const mockOnChoice = vi.fn();
    render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={true}
        hasVertexAI={false}
        onChoice={mockOnChoice}
      />,
    );

    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    onSelect('gemini-api-key');

    expect(mockOnChoice).toHaveBeenCalledWith('gemini-api-key');
  });

  it('should show Vertex AI fallback option when hasVertexAI is true', () => {
    render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={false}
        hasVertexAI={true}
        onChoice={() => {}}
      />,
    );

    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          {
            label: 'Try again later',
            value: 'retry_later',
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry',
            key: 'retry',
          },
          {
            label: 'Always fallback to Vertex AI',
            value: 'vertex-ai',
            key: 'vertex-ai',
          },
        ]),
      }),
      undefined,
    );
  });

  it('should call onChoice with "vertex-ai" when Vertex AI option is selected', () => {
    const mockOnChoice = vi.fn();
    render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={false}
        hasVertexAI={true}
        onChoice={mockOnChoice}
      />,
    );

    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    onSelect('vertex-ai');

    expect(mockOnChoice).toHaveBeenCalledWith('vertex-ai');
  });

  it('should show both fallback options when both hasApiKey and hasVertexAI are true', () => {
    render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        hasApiKey={true}
        hasVertexAI={true}
        onChoice={() => {}}
      />,
    );

    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          {
            label: 'Try again later',
            value: 'retry_later',
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry',
            key: 'retry',
          },
          {
            label: 'Always fallback to Gemini API key',
            value: 'gemini-api-key',
            key: 'gemini-api-key',
          },
          {
            label: 'Always fallback to Vertex AI',
            value: 'vertex-ai',
            key: 'vertex-ai',
          },
        ]),
      }),
      undefined,
    );
  });
});
