import React from 'react';
import { Box, Text } from 'ink';
import { UI_WIDTH, BOX_PADDING_X } from '../constants.js';
import { shortenPath } from '../../utils/paths.js';

interface HeaderProps {
  cwd: string;
}

const Header: React.FC<HeaderProps> = ({ cwd }) => (
    <>
      {/* Static Header Art */}
      <Box marginBottom={1}>
        <Text color="blue">{`
   ______  ________  ____    ____  _____  ____  _____  _____
 .' ___  ||_   __  ||_   \\  /   _||_   _||_   \\|_   _||_   _|
/ .'   \\_|  | |_ \\_|  |   \\/   |    | |    |   \\ | |    | |
| |   ____  |  _| _   | |\\  /| |    | |    | |\\ \\| |    | |
\\ \`.___]  |_| |__/ | _| |_\\/_| |_  _| |_  _| |_\\   |_  _| |_
 \`._____.'|________||_____||_____||_____||_____|\\____||_____|`}</Text>
      </Box>
      {/* CWD Display */}
      <Box
        borderStyle="round"
        borderColor="blue"
        paddingX={BOX_PADDING_X}
        flexDirection="column"
        marginBottom={1}
        width={UI_WIDTH}
      >
        <Box paddingLeft={2}>
          <Text color="gray">cwd: {shortenPath(cwd, /*maxLength*/ 70)}</Text>
        </Box>
      </Box>
    </>
  );

export default Header;
