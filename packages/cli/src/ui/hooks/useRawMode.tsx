import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export function useRawMode(enabled: boolean) {
  const [isRawMode, setIsRawMode] = useState(false);

  useInput((input) => {
    if (enabled && input.toLowerCase() === 'r') {
      setIsRawMode((prev) => !prev);
    }
  });

  const toggleComponent = enabled ? (
    <Box alignSelf="flex-end">
      <Text dimColor>
        {isRawMode ? 'Press `r` to see rendered' : 'Press `r` to see raw'}
      </Text>
    </Box>
  ) : null;

  return { isRawMode, toggleComponent };
}
