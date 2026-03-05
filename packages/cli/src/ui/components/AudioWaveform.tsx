/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useMemo } from 'react';

export type VoiceState =
    | 'idle'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error';

export interface AudioWaveformProps {
    state: VoiceState;
    amplitudes?: number[];
    width?: number;
}

const BLOCKS = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function getBlock(amplitude: number): string {
    if (amplitude <= 0) return BLOCKS[0]!;
    if (amplitude >= 1) return BLOCKS[BLOCKS.length - 1]!;
    const index = Math.floor(amplitude * BLOCKS.length);
    return BLOCKS[Math.min(index, BLOCKS.length - 1)]!;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
    state,
    amplitudes = [],
    width: propsWidth = 40,
}) => {
    const width = Math.max(0, Math.floor(propsWidth));
    const rendered = useMemo(() => {
        if (state === 'idle') {
            return null;
        }

        if (state === 'error') {
            return <Text color={theme.status.error}>Voice session error.</Text>;
        }

        let color: string;
        let blocks: string;

        if (state === 'processing') {
            color = theme.status.warning;
            blocks = '▅'.repeat(width);
        } else {
            color = state === 'speaking' ? theme.text.link : theme.status.success;
            const amps = amplitudes.length > 0 ? amplitudes : (Array(width).fill(0) as number[]);
            const displayAmps = (Array(width).fill(0) as number[]).map((_, i) => {
                const srcIdx = Math.floor((i / width) * amps.length);
                return amps[srcIdx] || 0;
            });
            blocks = displayAmps.map(getBlock).join('');
        }

        return (
            <Text color={color} wrap="truncate">
                {blocks}
            </Text>
        );
    }, [state, amplitudes, width]);

    if (!rendered) {
        return null;
    }

    return <Box width={width}>{rendered}</Box>;
};
