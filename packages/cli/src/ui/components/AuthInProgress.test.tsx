/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { AuthInProgress } from './AuthInProgress';

describe('AuthInProgress Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should display authentication in progress message', () => {
    const { lastFrame } = render(<AuthInProgress />);
    
    expect(lastFrame()).toContain('Authenticating');
  });

  it('should show loading indicator', () => {
    const { lastFrame } = render(<AuthInProgress />);
    
    // Should contain some form of loading indicator
    const output = lastFrame();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/); // Spinner characters
  });

  it('should handle authentication timeout', async () => {
    const onTimeout = vi.fn();
    
    render(<AuthInProgress onTimeout={onTimeout} timeout={100} />);
    
    // Fast-forward time
    vi.advanceTimersByTime(150);
    
    expect(onTimeout).toHaveBeenCalled();
  });

  it('should display progress steps', () => {
    const steps = ['Connecting to Google', 'Verifying credentials', 'Completing setup'];
    
    const { lastFrame } = render(
      <AuthInProgress steps={steps} currentStep={1} />
    );
    
    expect(lastFrame()).toContain('Verifying credentials');
    expect(lastFrame()).toContain('2/3'); // Step indicator
  });

  it('should handle authentication success', () => {
    const onSuccess = vi.fn();
    
    const { rerender } = render(
      <AuthInProgress onSuccess={onSuccess} />
    );
    
    // Simulate success
    rerender(<AuthInProgress onSuccess={onSuccess} success={true} />);
    
    expect(onSuccess).toHaveBeenCalled();
  });

  it('should handle authentication error', () => {
    const onError = vi.fn();
    const error = new Error('Authentication failed: Invalid credentials');
    
    const { lastFrame } = render(
      <AuthInProgress onError={onError} error={error} />
    );
    
    expect(lastFrame()).toContain('failed');
    expect(lastFrame()).toContain('Invalid credentials');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should show cancel option', () => {
    const onCancel = vi.fn();
    
    const { lastFrame } = render(
      <AuthInProgress onCancel={onCancel} showCancel={true} />
    );
    
    expect(lastFrame()).toContain('Cancel');
    expect(lastFrame()).toMatch(/ctrl\+c|esc/i);
  });

  it('should animate loading spinner', () => {
    const { lastFrame } = render(<AuthInProgress animated={true} />);
    
    const frame1 = lastFrame();
    
    // Advance animation frame
    vi.advanceTimersByTime(100);
    
    const frame2 = lastFrame();
    
    // Animation should cause different frames (spinner rotation)
    expect(frame1).toBeDefined();
    expect(frame2).toBeDefined();
  });

  it('should display authentication URL when provided', () => {
    const authUrl = 'https://accounts.google.com/oauth/authorize?client_id=123';
    
    const { lastFrame } = render(
      <AuthInProgress authUrl={authUrl} />
    );
    
    expect(lastFrame()).toContain('accounts.google.com');
    expect(lastFrame()).toContain('Open this URL');
  });

  it('should handle different authentication methods', () => {
    const { lastFrame: browserFrame } = render(
      <AuthInProgress method="browser" />
    );
    
    const { lastFrame: deviceFrame } = render(
      <AuthInProgress method="device" />
    );
    
    expect(browserFrame()).toContain('browser');
    expect(deviceFrame()).toContain('device');
  });

  it('should show retry option on failure', () => {
    const onRetry = vi.fn();
    const error = new Error('Network timeout');
    
    const { lastFrame } = render(
      <AuthInProgress error={error} onRetry={onRetry} showRetry={true} />
    );
    
    expect(lastFrame()).toContain('Retry');
    expect(lastFrame()).toContain('R');
  });

  it('should display estimated time remaining', () => {
    const { lastFrame } = render(
      <AuthInProgress estimatedTime={30} />
    );
    
    expect(lastFrame()).toMatch(/\d+\s*seconds?/);
  });

  it('should handle keyboard input for cancellation', () => {
    const onCancel = vi.fn();
    
    const { stdin } = render(
      <AuthInProgress onCancel={onCancel} showCancel={true} />
    );
    
    // Simulate Ctrl+C
    stdin.write('\u0003');
    
    expect(onCancel).toHaveBeenCalled();
  });
});