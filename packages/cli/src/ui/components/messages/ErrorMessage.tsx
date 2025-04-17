import React from 'react';
import { Text, Box } from 'ink';

interface ErrorMessageProps {
  text: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ text }) => {
  const prefix = '✕ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color="red">{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color="red">
          {text}
        </Text>
      </Box>
    </Box>
  );
};

export default ErrorMessage;
