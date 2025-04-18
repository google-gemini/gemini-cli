import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { globalConfig } from '../../config/config.js';



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
  const model = globalConfig.getModel();

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
          placeholder={`Ask Gemini (${model})... (try "/init" or "/help")`}
        />
      </Box>
    </Box>
  );
}

export default InputPrompt;
