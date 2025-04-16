import React from 'react';
import { Text, Box } from 'ink';
import { MarkdownRenderer } from '../../utils/MarkdownRenderer.js';

interface GeminiMessageProps {
    text: string;
}

const GeminiMessage: React.FC<GeminiMessageProps> = ({ text }) => {
    const prefix = '✦ ';
    const prefixWidth = prefix.length;

    // Handle potentially null or undefined text gracefully
    const safeText = text || '';

    // Use the static render method from the MarkdownRenderer class
    // Pass safeText which is guaranteed to be a string
    const renderedBlocks = MarkdownRenderer.render(safeText);

    // If the original text was actually empty/null, render the minimal state
     if (!safeText && renderedBlocks.length === 0) {
        return (
             <Box flexDirection="row">
                <Box width={prefixWidth}>
                    <Text color="blue">{prefix}</Text>
                </Box>
                <Box flexGrow={1}></Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="row">
            <Box width={prefixWidth}>
                <Text color="blue">{prefix}</Text>
            </Box>
            <Box flexGrow={1} flexDirection="column">
                {renderedBlocks}
            </Box>
        </Box>
    );
};

export default GeminiMessage;