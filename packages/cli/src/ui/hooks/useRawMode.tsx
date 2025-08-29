import { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export function useRawMode() {
  const [isRawMode, setIsRawMode] = useState(false);

  useInput((input) => {
    if (input.toLowerCase() === 'r') {
      setIsRawMode((prev) => !prev);
    }
  });

  const toggleComponent = (
    <Box alignSelf="flex-end">
      <Text dimColor>
        {isRawMode ? 'Press `r` to see rendered' : 'Press `r` to see raw'}
      </Text>
    </Box>
  );

  return { isRawMode, toggleComponent };
}
