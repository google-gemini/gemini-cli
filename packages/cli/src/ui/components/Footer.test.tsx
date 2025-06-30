/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Footer } from './Footer';

describe('Footer Component', () => {
  it('should render footer content', () => {
    const { lastFrame } = render(<Footer />);
    
    const output = lastFrame();
    expect(output.length).toBeGreaterThan(0);
  });

  it('should display help shortcuts', () => {
    const { lastFrame } = render(<Footer showHelp={true} />);
    
    expect(lastFrame()).toMatch(/help|H|\?/i);
  });

  it('should show status information', () => {
    const status = 'Connected to Gemini API';
    
    const { lastFrame } = render(<Footer status={status} />);
    
    expect(lastFrame()).toContain(status);
  });

  it('should display keyboard shortcuts', () => {
    const shortcuts = [
      { key: 'q', description: 'Quit application' },
      { key: 'h', description: 'Show help' },
      { key: 'ctrl+c', description: 'Cancel operation' }
    ];
    
    const { lastFrame } = render(<Footer shortcuts={shortcuts} />);
    
    expect(lastFrame()).toContain('q');
    expect(lastFrame()).toContain('Quit');
    expect(lastFrame()).toContain('ctrl+c');
  });

  it('should handle different themes', () => {
    const { lastFrame: darkFrame } = render(<Footer theme="dark" />);
    const { lastFrame: lightFrame } = render(<Footer theme="light" />);
    
    // Both should render without errors
    expect(darkFrame().length).toBeGreaterThan(0);
    expect(lightFrame().length).toBeGreaterThan(0);
  });

  it('should show connection status', () => {
    const { lastFrame } = render(<Footer connected={true} />);
    
    expect(lastFrame()).toMatch(/connected|online|✓/i);
  });

  it('should display error states', () => {
    const error = 'Connection failed - check your internet';
    
    const { lastFrame } = render(<Footer error={error} />);
    
    expect(lastFrame()).toContain(error);
    expect(lastFrame()).toMatch(/error|✗|!/i);
  });

  it('should handle missing props gracefully', () => {
    const { lastFrame } = render(<Footer />);
    
    // Should not crash with minimal props
    expect(lastFrame()).toBeDefined();
    expect(lastFrame()).not.toContain('undefined');
    expect(lastFrame()).not.toContain('null');
  });

  it('should format shortcuts properly', () => {
    const shortcuts = [
      { key: 'ctrl+c', description: 'Exit application' },
      { key: 'enter', description: 'Submit input' },
      { key: 'tab', description: 'Auto-complete' }
    ];
    
    const { lastFrame } = render(<Footer shortcuts={shortcuts} />);
    
    const output = lastFrame();
    expect(output).toContain('ctrl+c');
    expect(output).toContain('Exit');
    expect(output).toContain('enter');
    expect(output).toContain('Submit');
  });

  it('should handle responsive layout', () => {
    const { lastFrame } = render(<Footer width={120} />);
    
    const output = lastFrame();
    expect(output.length).toBeGreaterThan(0);
    
    // Test narrow layout
    const { lastFrame: narrowFrame } = render(<Footer width={40} />);
    expect(narrowFrame().length).toBeGreaterThan(0);
  });

  it('should display model information', () => {
    const modelInfo = {
      name: 'gemini-pro',
      version: '1.0',
      capabilities: ['text', 'code']
    };
    
    const { lastFrame } = render(<Footer model={modelInfo} />);
    
    expect(lastFrame()).toContain('gemini-pro');
    expect(lastFrame()).toContain('1.0');
  });

  it('should show usage statistics', () => {
    const usage = {
      tokensUsed: 1500,
      tokensRemaining: 8500,
      requestCount: 25
    };
    
    const { lastFrame } = render(<Footer usage={usage} />);
    
    expect(lastFrame()).toContain('1500');
    expect(lastFrame()).toContain('25');
  });

  it('should handle loading states', () => {
    const { lastFrame } = render(<Footer loading={true} />);
    
    expect(lastFrame()).toMatch(/loading|\.{3}|…/i);
  });

  it('should display time information', () => {
    const { lastFrame } = render(<Footer showTime={true} />);
    
    expect(lastFrame()).toMatch(/\d{1,2}:\d{2}/); // Time format HH:MM
  });

  it('should handle long status messages with truncation', () => {
    const longStatus = 'This is a very long status message that should be truncated when the terminal width is limited to prevent layout issues';
    
    const { lastFrame } = render(<Footer status={longStatus} width={60} />);
    
    const output = lastFrame();
    expect(output.length).toBeGreaterThan(0);
    // Should handle truncation gracefully
  });

  it('should support custom colors', () => {
    const { lastFrame } = render(
      <Footer 
        statusColor="green" 
        errorColor="red" 
        connected={true} 
      />
    );
    
    // Should render without errors with custom colors
    expect(lastFrame().length).toBeGreaterThan(0);
  });
});