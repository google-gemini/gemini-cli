import React from 'react';
import { Text, Box } from 'ink';

interface InfoMessageProps {
    text: string;
}

const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
    const prefix = 'ℹ ';
    const prefixWidth = prefix.length;

    return (
        <Box flexDirection="row">
            <Box width={prefixWidth}>
                <Text color="yellow">{prefix}</Text>
            </Box>
            <Box flexGrow={1}>
                <Text wrap="wrap" color="yellow">{text}</Text>
            </Box>
        </Box>
    );
};

export default InfoMessage;