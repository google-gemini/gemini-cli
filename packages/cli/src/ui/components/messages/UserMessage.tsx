import React from 'react';
import { Text, Box } from 'ink';

interface UserMessageProps {
  text: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color="gray">{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    </Box>
  );
};

export default UserMessage;
