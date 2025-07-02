import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { Colors } from '../colors.js';

interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  keyType: string;
}

export function ApiKeyInput({
  onSubmit,
  onCancel,
  keyType,
}: ApiKeyInputProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    setRawMode(true);

    const handleData = (data: Buffer) => {
      const input = data.toString();
      
      // Handle special keys
      if (input === '\x03') { // Ctrl+C
        onCancel();
        return;
      }
      if (input === '\x1b') { // Escape
        onCancel();
        return;
      }
      if (input === '\r' || input === '\n') { // Enter
        if (apiKey.trim()) {
          onSubmit(apiKey.trim());
        }
        return;
      }
      if (input === '\x7f' || input === '\b') { // Backspace
        setApiKey(prev => prev.slice(0, -1));
        return;
      }
      
      // Handle paste (multiple characters at once)
      if (input.length > 1) {
        // This is likely a paste operation
        // Clean any control sequences
        const cleaned = input
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI sequences
          .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
          .trim();
        
        setApiKey(prev => prev + cleaned);
      } else if (input.match(/^[ -~]$/)) {
        // Regular printable character
        setApiKey(prev => prev + input);
      }
    };

    stdin?.on('data', handleData);

    return () => {
      setRawMode(false);
      stdin?.off('data', handleData);
    };
  }, [stdin, setRawMode, apiKey, onSubmit, onCancel]);

  const displayValue = showKey ? apiKey : '*'.repeat(Math.min(apiKey.length, 60));

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Enter {keyType}</Text>
      <Box marginTop={1}>
        <Text>API Key: {displayValue}</Text>
        {apiKey.length === 0 && <Text color={Colors.Gray}> (paste your key here)</Text>}
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Length: {apiKey.length} characters
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          (Press Enter to submit, Esc to cancel)
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          💡 Just paste your API key - it will be masked automatically
        </Text>
      </Box>
    </Box>
  );
}
