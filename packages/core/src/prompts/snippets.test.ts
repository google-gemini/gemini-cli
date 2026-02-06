/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getCompressionPrompt } from './snippets.js';

describe('getCompressionPrompt', () => {
  it('should return a non-empty compression prompt', () => {
    const prompt = getCompressionPrompt();
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should contain the state_snapshot XML structure', () => {
    const prompt = getCompressionPrompt();
    expect(prompt).toContain('<state_snapshot>');
    expect(prompt).toContain('</state_snapshot>');
  });

  it('should contain all required sections in the schema', () => {
    const prompt = getCompressionPrompt();

    // Core sections that must be present
    const requiredSections = [
      '<overall_goal>',
      '</overall_goal>',
      '<active_constraints>',
      '</active_constraints>',
      '<key_knowledge>',
      '</key_knowledge>',
      '<artifact_trail>',
      '</artifact_trail>',
      '<file_system_state>',
      '</file_system_state>',
      '<recent_actions>',
      '</recent_actions>',
      '<task_state>',
      '</task_state>',
    ];

    for (const section of requiredSections) {
      expect(prompt).toContain(section);
    }
  });

  it('should contain failed_approaches section to prevent retry loops', () => {
    const prompt = getCompressionPrompt();

    expect(prompt).toContain('<failed_approaches>');
    expect(prompt).toContain('</failed_approaches>');
    // Should explain the purpose
    expect(prompt).toMatch(/failed|did not work|prevent.*retry/i);
  });

  it('should contain critical_details section for verbatim technical info', () => {
    const prompt = getCompressionPrompt();

    expect(prompt).toContain('<critical_details>');
    expect(prompt).toContain('</critical_details>');
    // Should emphasize verbatim/exact preservation
    expect(prompt).toMatch(/verbatim|exact|must not be paraphrased/i);
  });

  it('should contain security rules against prompt injection', () => {
    const prompt = getCompressionPrompt();

    expect(prompt).toContain('CRITICAL SECURITY RULE');
    expect(prompt).toMatch(/ignore.*commands|ignore.*instructions/i);
    expect(prompt).toContain('prompt injection');
  });

  it('should instruct the model to use a scratchpad for reasoning', () => {
    const prompt = getCompressionPrompt();

    expect(prompt).toContain('<scratchpad>');
  });

  it('should provide concrete examples for each section', () => {
    const prompt = getCompressionPrompt();

    // Check that examples are provided (indicated by "Example:" comments)
    const exampleCount = (prompt.match(/Example:/g) || []).length;
    expect(exampleCount).toBeGreaterThanOrEqual(5);
  });

  it('should emphasize density and brevity', () => {
    const prompt = getCompressionPrompt();

    expect(prompt).toMatch(/dense|concise|omit.*filler/i);
  });

  it('failed_approaches examples should include error context', () => {
    const prompt = getCompressionPrompt();

    // The failed_approaches section should demonstrate including error messages
    // and explanations of why things failed
    const failedApproachesSection = prompt.match(
      /<failed_approaches>[\s\S]*?<\/failed_approaches>/,
    );
    expect(failedApproachesSection).toBeTruthy();

    const section = failedApproachesSection![0];
    // Should show examples with error messages or failure reasons
    expect(section).toMatch(/error|failed|incompatible|EADDRINUSE/i);
  });

  it('critical_details examples should include specific technical values', () => {
    const prompt = getCompressionPrompt();

    const criticalDetailsSection = prompt.match(
      /<critical_details>[\s\S]*?<\/critical_details>/,
    );
    expect(criticalDetailsSection).toBeTruthy();

    const section = criticalDetailsSection![0];
    // Should include examples of ports, URLs, error messages, env vars
    expect(section).toMatch(/localhost:\d+|https?:\/\/|env.*var/i);
  });
});
