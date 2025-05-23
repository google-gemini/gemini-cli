/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { Text } from 'ink'; // Import Text directly from ink
import { LoadingIndicator } from './LoadingIndicator.js';

vi.mock('ink-spinner', () => ({
  default: function MockSpinner() {
    return <Text>MockSpinner</Text>;
  },
}));

describe('<LoadingIndicator />', () => {
  it('should not render when isLoading is false', () => {
    const { lastFrame } = render(
      <LoadingIndicator
        isLoading={false}
        showSpinner={true}
        currentLoadingPhrase="Loading..."
        elapsedTime={0}
      />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render spinner, phrase, and time when isLoading is true and showSpinner is true', () => {
    const phrase = 'Processing data...';
    const time = 5;
    const { lastFrame } = render(
      <LoadingIndicator
        isLoading={true}
        showSpinner={true}
        currentLoadingPhrase={phrase}
        elapsedTime={time}
      />,
    );

    const output = lastFrame();
    expect(output).toContain(phrase);
    expect(output).toContain(`(esc to cancel, ${time}s)`);
    // Check for spinner presence by looking for its characteristic characters or structure
    // This is a bit fragile as it depends on Spinner's output.
    // A more robust way would be to mock Spinner and check if it was rendered.
    expect(output).toContain('MockSpinner'); // Check for the mocked spinner text
  });

  it('should render phrase and time but no spinner when isLoading is true and showSpinner is false', () => {
    const phrase = 'Waiting for input...';
    const time = 10;
    const { lastFrame } = render(
      <LoadingIndicator
        isLoading={true}
        showSpinner={false}
        currentLoadingPhrase={phrase}
        elapsedTime={time}
      />,
    );
    const output = lastFrame();
    expect(output).toContain(phrase);
    expect(output).toContain(`(esc to cancel, ${time}s)`);
    // Ensure spinner characters are NOT present
    expect(output).not.toContain('MockSpinner');
  });

  it('should display the currentLoadingPhrase correctly', () => {
    const specificPhrase = 'Almost there!';
    const { lastFrame } = render(
      <LoadingIndicator
        isLoading={true}
        showSpinner={true}
        currentLoadingPhrase={specificPhrase}
        elapsedTime={3}
      />,
    );
    expect(lastFrame()).toContain(specificPhrase);
  });

  it('should display the elapsedTime correctly', () => {
    const specificTime = 7;
    const { lastFrame } = render(
      <LoadingIndicator
        isLoading={true}
        showSpinner={true}
        currentLoadingPhrase="Working..."
        elapsedTime={specificTime}
      />,
    );
    expect(lastFrame()).toContain(`(esc to cancel, ${specificTime}s)`);
  });
});
