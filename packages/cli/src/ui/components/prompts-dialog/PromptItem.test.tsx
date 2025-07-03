/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PredefinedPrompt } from '@google/gemini-cli-core';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptItem } from './PromptItem.js';

// Mock the renderTemplate function
vi.mock('../../../utils/template.js', () => ({
  renderTemplate: vi.fn(),
}));

// Extend global interface for test mocking
declare global {
  var mockTextInputSubmit: ((value: string) => void) | undefined;
}

// Mock UncontrolledTextInput to make it testable
vi.mock('ink-text-input', () => ({
  UncontrolledTextInput: ({
    onSubmit,
  }: {
    onSubmit: (value: string) => void;
  }) => {
    // Store onSubmit for test access
    global.mockTextInputSubmit = onSubmit;
    return null;
  },
}));

// Mock console.error to avoid noise in tests
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('PromptItem', () => {
  const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

  const mockOnSubmit = vi.fn();
  const mockSetErrorMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete global.mockTextInputSubmit;
  });

  afterEach(() => {
    consoleSpy.mockClear();
  });

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

  it('should render prompt name and description', () => {
    const prompt = createPrompt(
      'Test Prompt',
      'Hello {{name}}!',
      'A test prompt',
      [{ name: 'name', type: 'string', required: true }],
    );

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Test Prompt');
    expect(output).toContain('A test prompt');
  });

  it('should render prompt without description', () => {
    const prompt = createPrompt('Simple Prompt', 'Simple template', undefined, [
      { name: 'test', type: 'string', required: true },
    ]);

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Simple Prompt');
    expect(output).not.toContain('A test prompt');
  });

  it('should render prompt with no variables and complete immediately', async () => {
    const prompt = createPrompt('No Variables', 'Static template');

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Component returns null for no variables, but calls onSubmit with template directly
    expect(mockOnSubmit).toHaveBeenCalledWith('Static template');
    expect(lastFrame()).toBe('');
  });

  it('should handle single variable input', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockReturnValue('Hello John!');

    const prompt = createPrompt(
      'Single Variable',
      'Hello {{name}}!',
      undefined,
      [{ name: 'name', type: 'string', required: true }],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate text input submission
    const mockTextInputSubmit = global.mockTextInputSubmit;
    expect(mockTextInputSubmit).toBeDefined();

    mockTextInputSubmit!('John');
    await wait();

    expect(renderTemplate).toHaveBeenCalledWith('Hello {{name}}!', {
      name: 'John',
    });
    expect(mockOnSubmit).toHaveBeenCalledWith('Hello John!');
  });

  it('should handle multiple variables sequentially', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockReturnValue(
      'class UserController extends Controller {}',
    );

    const prompt = createPrompt(
      'Multi Variable',
      'class {{name}}{{type}} extends {{base}} {}',
      undefined,
      [
        { name: 'name', type: 'string', required: true },
        { name: 'type', type: 'string', required: true },
        { name: 'base', type: 'string', required: true },
      ],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // First variable
    let mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('User');
    await wait();

    // Second variable
    mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('Controller');
    await wait();

    // Third variable
    mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('Controller');
    await wait();

    expect(renderTemplate).toHaveBeenCalledWith(
      'class {{name}}{{type}} extends {{base}} {}',
      { name: 'User', type: 'Controller', base: 'Controller' },
    );
    expect(mockOnSubmit).toHaveBeenCalledWith(
      'class UserController extends Controller {}',
    );
  });

  it('should reject empty input and show error', async () => {
    const prompt = createPrompt(
      'Required Input',
      'Hello {{name}}!',
      undefined,
      [{ name: 'name', type: 'string', required: true }],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate empty input submission
    const mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('');
    await wait();

    expect(mockSetErrorMessage).toHaveBeenCalledWith('Input cannot be empty');
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should reject whitespace-only input and show error', async () => {
    const prompt = createPrompt(
      'Required Input',
      'Hello {{name}}!',
      undefined,
      [{ name: 'name', type: 'string', required: true }],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate whitespace-only input submission
    const mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('   \t  ');
    await wait();

    expect(mockSetErrorMessage).toHaveBeenCalledWith('Input cannot be empty');
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should trim input values', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockReturnValue('Hello John!');

    const prompt = createPrompt('Trim Test', 'Hello {{name}}!', undefined, [
      { name: 'name', type: 'string', required: true },
    ]);

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate input with leading/trailing whitespace
    const mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('  John  ');
    await wait();

    expect(renderTemplate).toHaveBeenCalledWith('Hello {{name}}!', {
      name: 'John',
    });
    expect(mockOnSubmit).toHaveBeenCalledWith('Hello John!');
  });

  it('should handle template rendering errors', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockImplementation(() => {
      throw new Error('Template rendering failed');
    });

    const prompt = createPrompt(
      'Error Test',
      'Invalid {{template}}',
      undefined,
      [{ name: 'template', type: 'string', required: true }],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate input submission that will trigger template error
    const mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('value');
    await wait();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error rendering prompt template:',
      expect.any(Error),
    );
    expect(mockSetErrorMessage).toHaveBeenCalledWith(
      'Failed to generate prompt from template',
    );
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should handle prompt with undefined variables', async () => {
    const prompt: PredefinedPrompt = {
      name: 'Undefined Variables',
      template: 'Static content',
      variables: undefined,
    };

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Component calls onSubmit directly with template for no variables
    expect(mockOnSubmit).toHaveBeenCalledWith('Static content');
    expect(lastFrame()).toBe('');
  });

  it('should show completion message when all variables are filled', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockReturnValue('Complete template');

    const prompt = createPrompt(
      'Completion Test',
      'Hello {{name}}!',
      undefined,
      [{ name: 'name', type: 'string', required: true }],
    );

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    // Simulate input submission
    const mockTextInputSubmit = global.mockTextInputSubmit;
    mockTextInputSubmit!('World');
    await wait();

    const output = lastFrame();
    expect(output).toContain('✓ All variables completed. Submitting prompt...');
  });

  it('should clear error message on successful input', async () => {
    const { renderTemplate } = await import('../../../utils/template.js');
    vi.mocked(renderTemplate).mockReturnValue('Hello ValidName!');

    const prompt = createPrompt(
      'Error Clear Test',
      'Hello {{name}}!',
      undefined,
      [{ name: 'name', type: 'string', required: true }],
    );

    render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    await wait();

    const mockTextInputSubmit = global.mockTextInputSubmit;

    // First submit empty to trigger error
    mockTextInputSubmit!('');
    await wait();

    expect(mockSetErrorMessage).toHaveBeenCalledWith('Input cannot be empty');

    // Then submit valid input
    mockTextInputSubmit!('ValidName');
    await wait();

    expect(mockSetErrorMessage).toHaveBeenCalledWith(null);
  });

  it('should display variables that are not yet reached', async () => {
    const prompt = createPrompt(
      'Sequential Test',
      'Hello {{first}} {{second}}!',
      undefined,
      [
        { name: 'first', type: 'string', required: true },
        { name: 'second', type: 'string', required: true },
      ],
    );

    const { lastFrame } = render(
      <PromptItem
        prompt={prompt}
        onSubmit={mockOnSubmit}
        setErrorMessage={mockSetErrorMessage}
      />,
    );

    // Should only show first input, not second
    const output = lastFrame();
    expect(output).toContain('Enter first:');
    expect(output).not.toContain('Enter second:');
  });
});
