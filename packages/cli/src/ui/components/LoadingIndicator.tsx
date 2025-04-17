import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface LoadingIndicatorProps {
  isLoading: boolean;
  currentLoadingPhrase: string;
  elapsedTime: number;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  isLoading,
  currentLoadingPhrase,
  elapsedTime,
}) => {
  if (!isLoading) {
    return null; // Don't render anything if not loading
  }

  return (
    <Box marginTop={1} paddingLeft={0}>
      <Box marginRight={1}>
        <Spinner type="dots" />
      </Box>
      <Text color="cyan">
        {currentLoadingPhrase} ({elapsedTime}s)
      </Text>
      <Box flexGrow={1}>{/* Spacer */}</Box>
      <Text color="gray">(ESC to cancel)</Text>
    </Box>
  );
};

export default LoadingIndicator;
