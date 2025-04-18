import React from 'react';
import { Box, Text } from 'ink';

interface FooterProps {
  queryLength: number;
}

export const Footer: React.FC<FooterProps> = ({ queryLength }) => (
  <Box marginTop={1} justifyContent="space-between">
    <Box minWidth={15}>
      <Text color="gray">{queryLength === 0 ? '? for shortcuts' : ''}</Text>
    </Box>
    <Text color="blue">Gemini</Text>
  </Box>
);
