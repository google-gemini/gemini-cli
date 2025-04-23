/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

const gradientColors = ['#4796E4', '#847ACE', '#C3677F'];

export const Header: React.FC = () => (
  <>
    <Box marginBottom={1} alignItems="flex-start">
      <Gradient colors={gradientColors}>
        <Text>{`
 ██████╗ ███████╗███╗   ███╗██╗███╗   ██╗██╗
██╔════╝ ██╔════╝████╗ ████║██║████╗  ██║██║
██║  ███╗█████╗  ██╔████╔██║██║██╔██╗ ██║██║
██║   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║
╚██████╔╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║
 ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝
                                            
 ██████╗ ██████╗ ██████╗ ███████╗           
██╔════╝██╔═══██╗██╔══██╗██╔════╝           
██║     ██║   ██║██║  ██║█████╗             
██║     ██║   ██║██║  ██║██╔══╝             
╚██████╗╚██████╔╝██████╔╝███████╗           
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝           
`}</Text>
      </Gradient>
    </Box>
  </>
);
