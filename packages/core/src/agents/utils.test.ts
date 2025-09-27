/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { templateString } from './utils.js';
import type { AgentInputs } from './types.js';

describe('templateString', () => {
  it('should replace a single placeholder with a string value', () => {
    const template = 'Hello, ${name}!';
    const inputs: AgentInputs = { name: 'World' };
    const result = templateString(template, inputs);
    expect(result).toBe('Hello, World!');
  });

  it('should replace multiple unique placeholders', () => {
    const template = 'User: ${user}, Role: ${role}';
    const inputs: AgentInputs = { user: 'Alex', role: 'Admin' };
    const result = templateString(template, inputs);
    expect(result).toBe('User: Alex, Role: Admin');
  });

  it('should replace multiple instances of the same placeholder', () => {
    const template = '${greeting}, ${user}. Welcome, ${user}!';
    const inputs: AgentInputs = { greeting: 'Hi', user: 'Sam' };
    const result = templateString(template, inputs);
    expect(result).toBe('Hi, Sam. Welcome, Sam!');
  });

  it('should handle various data types for input values', () => {
    const template =
      'Name: ${name}, Age: ${age}, Active: ${isActive}, Plan: ${plan}, Score: ${score}';
    const inputs: AgentInputs = {
      name: 'Jo',
      age: 30,
      isActive: true,
      plan: null,
      score: undefined,
    };
    const result = templateString(template, inputs);
    // All values are converted to their string representations
    expect(result).toBe(
      'Name: Jo, Age: 30, Active: true, Plan: null, Score: undefined',
    );
  });

  it('should return the original string if no placeholders are present', () => {
    const template = 'This is a plain string with no placeholders.';
    const inputs: AgentInputs = { key: 'value' };
    const result = templateString(template, inputs);
    expect(result).toBe('This is a plain string with no placeholders.');
  });

  it('should correctly handle an empty template string', () => {
    const template = '';
    const inputs: AgentInputs = { key: 'value' };
    const result = templateString(template, inputs);
    expect(result).toBe('');
  });

  it('should ignore extra keys in the inputs object that are not in the template', () => {
    const template = 'Hello, ${name}.';
    const inputs: AgentInputs = { name: 'Alice', extra: 'ignored' };
    const result = templateString(template, inputs);
    expect(result).toBe('Hello, Alice.');
  });

  it('should throw an error if a required key is missing from the inputs', () => {
    const template = 'The goal is ${goal}.';
    const inputs: AgentInputs = { other_input: 'some value' };

    expect(() => templateString(template, inputs)).toThrow(
      'Template validation failed: Missing required input parameters: goal. Available inputs: other_input',
    );
  });

  it('should throw an error listing all missing keys if multiple are missing', () => {
    const template = 'Analyze ${file} with ${tool}.';
    const inputs: AgentInputs = { an_available_key: 'foo' };

    // Using a regex to allow for any order of missing keys in the error message
    expect(() => templateString(template, inputs)).toThrow(
      /Missing required input parameters: (file, tool|tool, file)/,
    );
  });

  it('should be case-sensitive with placeholder keys', () => {
    const template = 'Value: ${Key}';
    const inputs: AgentInputs = { key: 'some value' }; // 'key' is lowercase

    expect(() => templateString(template, inputs)).toThrow(
      'Template validation failed: Missing required input parameters: Key. Available inputs: key',
    );
  });

  it('should not replace malformed or incomplete placeholders', () => {
    const template =
      'This is {not_a_placeholder} and this is $$escaped. Test: ${valid}';
    const inputs: AgentInputs = { valid: 'works' };
    const result = templateString(template, inputs);
    expect(result).toBe(
      'This is {not_a_placeholder} and this is $$escaped. Test: works',
    );
  });

  it('should work correctly with an empty inputs object if the template has no placeholders', () => {
    const template = 'Static text.';
    const inputs: AgentInputs = {};
    const result = templateString(template, inputs);
    expect(result).toBe('Static text.');
  });
});
