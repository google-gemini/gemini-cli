/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Footer } from './Footer';

// Mock core utilities
vi.mock('@google/gemini-cli-core', () => ({
  shortenPath: vi.fn((path) => path),
  tildeifyPath: vi.fn((path) => path),
  tokenLimit: vi.fn(() => 10000),
}));

// Mock components
vi.mock('./ConsoleSummaryDisplay.js', () => ({
  ConsoleSummaryDisplay: ({ errorCount }: { errorCount: number }) =>
    `${errorCount} errors`,
}));

vi.mock('./MemoryUsageDisplay.js', () => ({
  MemoryUsageDisplay: () => 'Memory: 85%',
}));

describe('Footer Component', () => {
  const defaultProps = {
    model: 'gemini-pro',
    targetDir: '/home/user/project',
    branchName: 'main',
    debugMode: false,
    debugMessage: '',
    corgiMode: false,
    errorCount: 0,
    showErrorDetails: false,
    showMemoryUsage: false,
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    totalTokenCount: 150,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render footer with basic information', () => {
    const { lastFrame } = render(<Footer {...defaultProps} />);

    const output = lastFrame();
    expect(output).toContain('gemini-pro');
    expect(output).toContain('/home/user/project');
    expect(output.length).toBeGreaterThan(0);
  });

  it('should display model information', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} model="gemini-1.5-pro" />,
    );

    expect(lastFrame()).toContain('gemini-1.5-pro');
  });

  it('should show branch name when provided', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} branchName="feature-branch" />,
    );

    expect(lastFrame()).toContain('feature-branch');
  });

  it('should display debug mode information', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} debugMode={true} debugMessage="Debug active" />,
    );

    expect(lastFrame()).toContain('Debug active');
  });

  it('should show corgi mode when enabled', () => {
    const { lastFrame } = render(<Footer {...defaultProps} corgiMode={true} />);

    const output = lastFrame();
    expect(output).toMatch(/[▼ᴥ´`()]/); // Corgi face characters
  });

  it('should display error count when showErrorDetails is false', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} errorCount={5} showErrorDetails={false} />,
    );

    expect(lastFrame()).toContain('5 errors');
  });

  it('should not display error summary when showErrorDetails is true', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} errorCount={5} showErrorDetails={true} />,
    );

    expect(lastFrame()).not.toContain('5 errors');
  });

  it('should show memory usage when enabled', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} showMemoryUsage={true} />,
    );

    expect(lastFrame()).toContain('Memory: 85%');
  });

  it('should calculate and display context percentage', () => {
    const props = {
      ...defaultProps,
      totalTokenCount: 5000, // 50% of 10000 limit
    };

    const { lastFrame } = render(<Footer {...props} />);

    expect(lastFrame()).toContain('50% context left');
  });

  it('should display sandbox information from environment', () => {
    const originalSandbox = process.env.SANDBOX;

    // Test no sandbox
    delete process.env.SANDBOX;
    const { lastFrame: noSandboxFrame } = render(<Footer {...defaultProps} />);
    expect(noSandboxFrame()).toContain('no sandbox');

    // Test sandbox-exec
    process.env.SANDBOX = 'sandbox-exec';
    const { lastFrame: seatbeltFrame } = render(<Footer {...defaultProps} />);
    expect(seatbeltFrame()).toContain('MacOS Seatbelt');

    // Test custom sandbox
    process.env.SANDBOX = 'gemini-docker';
    const { lastFrame: dockerFrame } = render(<Footer {...defaultProps} />);
    expect(dockerFrame()).toContain('docker');

    // Restore original
    if (originalSandbox) {
      process.env.SANDBOX = originalSandbox;
    } else {
      delete process.env.SANDBOX;
    }
  });

  it('should handle missing branch name gracefully', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} branchName={undefined} />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).not.toContain('undefined');
  });

  it('should display target directory path', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} targetDir="/very/long/path/to/project" />,
    );

    expect(lastFrame()).toContain('/very/long/path/to/project');
  });

  it('should handle zero error count', () => {
    const { lastFrame } = render(<Footer {...defaultProps} errorCount={0} />);

    expect(lastFrame()).not.toContain('0 errors');
  });

  it('should display context left percentage correctly for high usage', () => {
    const props = {
      ...defaultProps,
      totalTokenCount: 9500, // 95% of 10000 limit
    };

    const { lastFrame } = render(<Footer {...props} />);

    expect(lastFrame()).toContain('5% context left');
  });

  it('should handle debug mode without debug message', () => {
    const { lastFrame } = render(
      <Footer {...defaultProps} debugMode={true} debugMessage="" />,
    );

    expect(lastFrame()).toContain('--debug');
  });
});
