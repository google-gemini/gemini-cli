import React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

export function CommandConfirmDialog({
  command,
  onSelect,
}: {
  command: string;
  onSelect: (confirmed: boolean) => void;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text>Do you want to execute the following command?</Text>
      <Text color="cyan">{command}</Text>
      <RadioButtonSelect
        items={[
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]}
        onSelect={onSelect}
        isFocused={true}
      />
    </Box>
  );
}