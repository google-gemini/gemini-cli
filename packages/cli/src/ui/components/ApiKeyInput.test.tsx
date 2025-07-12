import React from 'react';
import { render } from 'ink-testing-library';
import { test, expect, vi } from 'vitest';
import { ApiKeyInput } from './ApiKeyInput.js';

test('ApiKeyInput renders correctly', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  
  const { lastFrame } = render(
    <ApiKeyInput
      keyType="Test API Key"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  expect(lastFrame()).toContain('Enter Test API Key');
  expect(lastFrame()).toContain('API Key:');
  expect(lastFrame()).toContain('Press Enter to submit, Esc to cancel');
});

test('ApiKeyInput masks input by default', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  
  const { lastFrame, stdin } = render(
    <ApiKeyInput
      keyType="Test API Key"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  // Type some characters
  stdin.write('abc123');
  
  // Should show masked characters
  expect(lastFrame()).toContain('******');
  expect(lastFrame()).not.toContain('abc123');
});

test('ApiKeyInput calls onSubmit with trimmed value', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  
  const { stdin } = render(
    <ApiKeyInput
      keyType="Test API Key"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  // Type API key with spaces
  stdin.write('  test-api-key-123  ');
  stdin.write('\r'); // Enter key

  expect(onSubmit).toHaveBeenCalledWith('test-api-key-123');
  expect(onCancel).not.toHaveBeenCalled();
});

test('ApiKeyInput calls onCancel on Escape', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  
  const { stdin } = render(
    <ApiKeyInput
      keyType="Test API Key"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  // Press escape
  stdin.write('\x1B');

  expect(onCancel).toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('ApiKeyInput does not submit empty value', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  
  const { stdin } = render(
    <ApiKeyInput
      keyType="Test API Key"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );

  // Just press enter without typing anything
  stdin.write('\r');

  expect(onSubmit).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});
