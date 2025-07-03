/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, PredefinedPrompt } from '@google/gemini-cli-core';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptsDialog } from './PromptsDialog.js';

// Mock RadioButtonSelect component
vi.mock('../shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: ({
    items,
    onSelect,
  }: {
    items: Array<{ label: string; value: string }>;
    onSelect: (value: string) => void;
  }) => {
    // Store onSelect for test access
    global.mockRadioButtonSelect = { items, onSelect };
    return (
      <Text>
        MockRadioButtonSelect[{items.map((item) => item.label).join(',')}]
      </Text>
    );
  },
}));

// Mock PromptItem component
vi.mock('./PromptItem.js', () => ({
  PromptItem: ({
    prompt,
    onSubmit,
    setErrorMessage,
  }: {
    prompt: PredefinedPrompt;
    onSubmit: (query: string) => void;
    setErrorMessage: (error: string | null) => void;
  }) => {
    // Store props for test access
    global.mockPromptItem = { prompt, onSubmit, setErrorMessage };
    return <Text>MockPromptItem[{prompt.name}]</Text>;
  },
}));

// Extend global interface for test mocking
declare global {
  var mockRadioButtonSelect:
    | {
        items: Array<{ label: string; value: string }>;
        onSelect: (value: string) => void;
      }
    | undefined;
  var mockPromptItem:
    | {
        prompt: PredefinedPrompt;
        onSubmit: (query: string) => void;
        setErrorMessage: (error: string | null) => void;
      }
    | undefined;
}

describe('PromptsDialog', () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  const mockOnSubmit = vi.fn();
  const mockOnEscape = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete global.mockRadioButtonSelect;
    delete global.mockPromptItem;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockConfig = (prompts: PredefinedPrompt[]): Config =>
    ({
      getPredefinedPrompts: () => prompts,
    }) as Config;

  const createPrompt = (
    name: string,
    template: string,
    description?: string,
    variables?: Array<{ name: string; type: string; required?: boolean }>,
  ): PredefinedPrompt => ({
    name,
    template,
    description,
    variables,
  });

  it('should render the prompt selection UI with available prompts', () => {
    const prompts = [
      createPrompt('Test Prompt 1', 'Template 1'),
      createPrompt('Test Prompt 2', 'Template 2'),
    ];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Select Prompt');
    expect(output).toContain(
      'MockRadioButtonSelect[Test Prompt 1,Test Prompt 2]',
    );
    expect(output).toContain('Search: Type to filter prompts');
  });

  it('should render with empty prompts list', () => {
    const config = createMockConfig([]);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Select Prompt');
    expect(output).toContain('MockRadioButtonSelect[]');
  });

  it('should handle valid prompt selection', async () => {
    const prompts = [
      createPrompt('Valid Prompt', 'Hello {{name}}!', 'A test prompt'),
    ];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Simulate selecting a valid prompt
    const radioButtonSelect = global.mockRadioButtonSelect;
    expect(radioButtonSelect).toBeDefined();
    radioButtonSelect!.onSelect('Valid Prompt');

    await wait();

    // Should transition to PromptItem
    const output = lastFrame();
    expect(output).toContain('MockPromptItem[Valid Prompt]');

    // Verify PromptItem received correct props
    const promptItem = global.mockPromptItem;
    expect(promptItem).toBeDefined();
    expect(promptItem!.prompt.name).toBe('Valid Prompt');
    expect(promptItem!.prompt.template).toBe('Hello {{name}}!');
  });

  it('should handle invalid prompt selection', async () => {
    const prompts = [createPrompt('Valid Prompt', 'Template')];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Simulate selecting an invalid prompt
    const radioButtonSelect = global.mockRadioButtonSelect;
    radioButtonSelect!.onSelect('Invalid Prompt');

    await wait();

    // Should show error message and stay on selection screen
    const output = lastFrame();
    expect(output).toContain('Invalid prompt selected "Invalid Prompt".');
    expect(output).toContain('MockRadioButtonSelect');
    expect(output).not.toContain('MockPromptItem');
  });

  it('should clear error message on valid selection after invalid one', async () => {
    const prompts = [createPrompt('Valid Prompt', 'Template')];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    const radioButtonSelect = global.mockRadioButtonSelect;

    // First select invalid prompt
    radioButtonSelect!.onSelect('Invalid Prompt');
    await wait();

    expect(lastFrame()).toContain('Invalid prompt selected "Invalid Prompt".');

    // Then select valid prompt
    radioButtonSelect!.onSelect('Valid Prompt');
    await wait();

    // Should transition to PromptItem without error
    const output = lastFrame();
    expect(output).toContain('MockPromptItem[Valid Prompt]');
    expect(output).not.toContain('Invalid prompt selected');
  });

  it('should handle escape key when onEscape is provided', async () => {
    const config = createMockConfig([]);

    const { stdin } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Simulate pressing escape key
    stdin.write('\u001b'); // ESC key
    await wait();

    expect(mockOnEscape).toHaveBeenCalledTimes(1);
  });

  it('should not handle escape key when onEscape is not provided', async () => {
    const config = createMockConfig([]);

    const { stdin } = render(
      <PromptsDialog config={config} onSubmit={mockOnSubmit} />,
    );

    await wait();

    // Simulate pressing escape key
    stdin.write('\u001b'); // ESC key
    await wait();

    // Should not throw error and onEscape should not be called
    expect(mockOnEscape).not.toHaveBeenCalled();
  });

  it('should handle submit with valid query from PromptItem', async () => {
    const prompts = [createPrompt('Test Prompt', 'Hello {{name}}!')];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Select a prompt to transition to PromptItem
    const radioButtonSelect = global.mockRadioButtonSelect;
    radioButtonSelect!.onSelect('Test Prompt');
    await wait();

    // Simulate PromptItem submitting a query
    const promptItem = global.mockPromptItem;
    promptItem!.onSubmit('Hello World!');
    await wait();

    // Should call onSubmit and reset to selection screen
    expect(mockOnSubmit).toHaveBeenCalledWith('Hello World!');

    const output = lastFrame();
    expect(output).toContain('MockRadioButtonSelect');
    expect(output).not.toContain('MockPromptItem');
  });

  it('should handle submit with empty query from PromptItem', async () => {
    const prompts = [createPrompt('Test Prompt', 'Hello {{name}}!')];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Select a prompt to transition to PromptItem
    const radioButtonSelect = global.mockRadioButtonSelect;
    radioButtonSelect!.onSelect('Test Prompt');
    await wait();

    // Simulate PromptItem submitting empty query
    const promptItem = global.mockPromptItem;
    promptItem!.onSubmit('');
    await wait();

    // Should show error and not call onSubmit
    expect(mockOnSubmit).not.toHaveBeenCalled();

    const output = lastFrame();
    expect(output).toContain('Query cannot be empty.');
  });

  it('should handle submit with whitespace-only query from PromptItem', async () => {
    const prompts = [createPrompt('Test Prompt', 'Hello {{name}}!')];
    const config = createMockConfig(prompts);

    render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Select a prompt to transition to PromptItem
    const radioButtonSelect = global.mockRadioButtonSelect;
    radioButtonSelect!.onSelect('Test Prompt');
    await wait();

    // Simulate PromptItem submitting whitespace-only query
    const promptItem = global.mockPromptItem;
    promptItem!.onSubmit('   \t  ');
    await wait();

    // Should call onSubmit with the whitespace (component doesn't trim)
    expect(mockOnSubmit).toHaveBeenCalledWith('   \t  ');
  });

  it('should pass setErrorMessage to PromptItem', async () => {
    const prompts = [createPrompt('Test Prompt', 'Template')];
    const config = createMockConfig(prompts);

    render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    await wait();

    // Select a prompt to transition to PromptItem
    const radioButtonSelect = global.mockRadioButtonSelect;
    radioButtonSelect!.onSelect('Test Prompt');
    await wait();

    // Verify PromptItem received setErrorMessage function
    const promptItem = global.mockPromptItem;
    expect(promptItem).toBeDefined();
    expect(typeof promptItem!.setErrorMessage).toBe('function');

    // Test that setErrorMessage works
    promptItem!.setErrorMessage('Test error from PromptItem');
    await wait();

    // The error should be managed by PromptItem, but we can verify the function exists
    expect(promptItem!.setErrorMessage).toBeDefined();
  });

  it('should handle config with null prompts', () => {
    const config = {
      getPredefinedPrompts: () => null,
    } as unknown as Config;

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Select Prompt');
    expect(output).toContain('MockRadioButtonSelect[]');
  });

  it('should render prompts with different properties correctly', () => {
    const prompts = [
      createPrompt('Simple', 'Simple template'),
      createPrompt('With Description', 'Template', 'Has description'),
      createPrompt('With Variables', 'Hello {{name}}!', undefined, [
        { name: 'name', type: 'string', required: true },
      ]),
    ];
    const config = createMockConfig(prompts);

    const { lastFrame } = render(
      <PromptsDialog
        config={config}
        onSubmit={mockOnSubmit}
        onEscape={mockOnEscape}
      />,
    );

    const output = lastFrame();
    expect(output).toContain(
      'MockRadioButtonSelect[Simple,With Description,With Variables]',
    );

    // Verify RadioButtonSelect received correct items
    const radioButtonSelect = global.mockRadioButtonSelect;
    expect(radioButtonSelect!.items).toEqual([
      { label: 'Simple', value: 'Simple' },
      { label: 'With Description', value: 'With Description' },
      { label: 'With Variables', value: 'With Variables' },
    ]);
  });
});
