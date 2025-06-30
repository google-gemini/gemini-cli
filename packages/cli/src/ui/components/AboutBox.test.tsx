/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { AboutBox } from './AboutBox';

// Mock version utility
vi.mock('../../utils/version', () => ({
  getVersion: vi.fn(() => '1.2.3'),
  getBuildInfo: vi.fn(() => ({ 
    date: '2025-01-01',
    commit: 'abc123',
    branch: 'main'
  }))
}));

describe('AboutBox Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render about information', () => {
    const { lastFrame } = render(<AboutBox />);
    
    expect(lastFrame()).toContain('Gemini CLI');
    expect(lastFrame()).toContain('version');
  });

  it('should display version information', () => {
    const { lastFrame } = render(<AboutBox />);
    
    // Should contain version pattern (e.g., "1.2.3")
    expect(lastFrame()).toMatch(/\d+\.\d+\.\d+/);
    expect(lastFrame()).toContain('1.2.3');
  });

  it('should show license information', () => {
    const { lastFrame } = render(<AboutBox />);
    
    expect(lastFrame()).toContain('Apache-2.0');
  });

  it('should handle missing version gracefully', () => {
    // Mock version utility to return unknown
    vi.mocked(require('../../utils/version').getVersion).mockReturnValue('unknown');
    
    const { lastFrame } = render(<AboutBox />);
    
    expect(lastFrame()).toContain('unknown');
  });

  it('should format content properly', () => {
    const { lastFrame } = render(<AboutBox />);
    const output = lastFrame();
    
    // Should have proper spacing and formatting
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('null');
  });

  it('should display copyright information', () => {
    const { lastFrame } = render(<AboutBox />);
    
    expect(lastFrame()).toMatch(/copyright|©/i);
    expect(lastFrame()).toContain('Google');
  });

  it('should show project description', () => {
    const { lastFrame } = render(<AboutBox />);
    
    expect(lastFrame()).toMatch(/CLI|command|line/i);
  });

  it('should display build information when available', () => {
    const { lastFrame } = render(<AboutBox showBuildInfo={true} />);
    
    expect(lastFrame()).toContain('abc123'); // commit hash
    expect(lastFrame()).toContain('2025-01-01'); // build date
  });

  it('should handle different display modes', () => {
    const { lastFrame: compactFrame } = render(<AboutBox compact={true} />);
    const { lastFrame: expandedFrame } = render(<AboutBox compact={false} />);
    
    // Compact should be shorter
    expect(compactFrame().length).toBeLessThan(expandedFrame().length);
  });

  it('should support custom styling', () => {
    const { lastFrame } = render(<AboutBox style={{ borderColor: 'red' }} />);
    
    // Should render without errors with custom styling
    expect(lastFrame().length).toBeGreaterThan(0);
  });

  it('should display keyboard shortcuts help', () => {
    const { lastFrame } = render(<AboutBox showHelp={true} />);
    
    expect(lastFrame()).toMatch(/press|key|help/i);
  });
});