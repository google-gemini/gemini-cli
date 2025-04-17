import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
  query: string;
  setQuery: (value: string) => void;
  onSubmit: (value: string) => void;
  isActive: boolean;
}

const InputPrompt: React.FC<InputPromptProps> = ({
  query,
  setQuery,
  onSubmit,
}) => {
  return (
    <Box marginTop={1} borderStyle="round" borderColor={'white'} paddingX={1}>
      <Text color={'white'}>&gt; </Text>
      <Box flexGrow={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={onSubmit}
          showCursor={true}
          focus={true}
          placeholder={'Ask Gemini... (try "/init" or "/help")'}
        />
      </Box>
    </Box>
  );
};

export default InputPrompt;
