import React from 'react';
import { Box, Text } from 'ink';

const ITermDetectionWarning: React.FC = () => {
  if (process.env.TERM_PROGRAM !== 'iTerm.app') {
    return null; // Don't render anything if not in iTerm
  }

  return (
    <Box marginTop={1}>
      <Text dimColor>Note: Flickering may occur in iTerm.</Text>
    </Box>
  );
};

export default ITermDetectionWarning;
