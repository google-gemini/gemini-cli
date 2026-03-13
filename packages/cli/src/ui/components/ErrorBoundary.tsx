/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { debugLogger } from '@google/gemini-cli-core';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * A top-level error boundary to catch render exceptions in the Ink UI.
 * This prevents the CLI from becoming unresponsive during a crash.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render shows the fallback UI.
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Satisfies the GSoC requirement: "Errors should be logged so they can be debugged later."
    debugLogger.error('UI_RENDER_CRASH', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  override render() {
    if (this.state.hasError) {
      // Safe minimal screen that allows the user to see what happened and exit.
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="red"
          padding={1}
        >
          <Text color="red" bold>
            {' '}
            UI CRASH DETECTED
          </Text>
          <Box marginBottom={1}>
            <Text color="white">
              {this.state.error?.message ??
                'An unexpected render error occurred.'}
            </Text>
          </Box>
          <Box flexDirection="column">
            <Text dimColor>
              The UI encountered a critical error and is frozen.
            </Text>
            <Text color="yellow" bold>
              Press Ctrl+C (twice if needed) to exit.
            </Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
