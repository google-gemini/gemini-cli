/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { HistoryItemWithoutId } from '../types.js';

// Helper to remove bracketed paste markers
const stripBracketedPaste = (text: string) => {
  const startMarker = '\x1b[200~';
  const endMarker = '\x1b[201~';

  let processedText = text;

  // The end marker seems to be consistently present with the escape sequence
  if (processedText.endsWith(endMarker)) {
    processedText = processedText.slice(0, -endMarker.length);
  }

  // The start marker sometimes appears without the initial escape sequence
  if (processedText.startsWith(startMarker)) {
    processedText = processedText.slice(startMarker.length);
  } else if (processedText.startsWith('[200~')) {
    processedText = processedText.slice('[200~'.length);
  }

  return processedText;
};

// Helper to check for base64 data URI
const isBase64DataUri = (text: string) => text.startsWith('data:image/');

// Helper to check for raw base64 JPEG
const isRawJpeg = (text: string) =>
  // Basic check for JPEG magic numbers in base64
  text.startsWith('/9j/');

interface PasteHandlerProps {
  onPaste: (pastedText: string) => void;
  onCancel: () => void;
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
}

export const PasteHandler: React.FC<PasteHandlerProps> = ({
  onPaste,
  onCancel,
  addItem,
}) => {
  const [buffer, setBuffer] = useState('');

  useInput((input, key) => {
    if (key.return) {
      // Enter key
      console.log(
        'PasteHandler: Enter key pressed. Raw buffer:',
        JSON.stringify(buffer),
      );
      // More robustly clean the input, removing any newlines from the paste
      const cleaned = buffer.replace(/(\r\n|\n|\r)/gm, '');
      const trimmed = cleaned.trim();
      console.log('PasteHandler: Buffer trimmed:', JSON.stringify(trimmed));
      const processedData = stripBracketedPaste(trimmed);
      console.log(
        'PasteHandler: Bracketed paste stripped:',
        JSON.stringify(processedData),
      );

      if (isBase64DataUri(processedData)) {
        console.log('PasteHandler: Valid base64 data URI detected.');
        onPaste(processedData);
        addItem(
          {
            type: 'pasted_image',
            text: 'Pasted image data received.',
          },
          Date.now(),
        );
      } else if (isRawJpeg(processedData)) {
        console.log('PasteHandler: Raw base64 JPEG detected. Adding prefix.');
        const fullDataUri = `data:image/jpeg;base64,${processedData}`;
        onPaste(fullDataUri);
        addItem(
          {
            type: 'pasted_image',
            text: 'Pasted raw JPEG data received and prefixed.',
          },
          Date.now(),
        );
      } else {
        console.error(
          'PasteHandler: Invalid data format. Not a base64 data URI or raw JPEG.',
        );
        addItem(
          {
            type: 'error',
            text: 'Error: Pasted data is not a valid base64 image.',
          },
          Date.now(),
        );
      }
      onCancel(); // Return to normal mode
    } else if (key.escape) {
      // Escape key
      // Escape key
      console.log('PasteHandler: Escape key pressed.');
      onCancel();
    } else {
      setBuffer((prev) => prev + input);
    }
  });

  useEffect(() => {
    console.log('PasteHandler: Component mounted.');
    return () => {
      console.log('PasteHandler: Component unmounted.');
    };
  }, []);

  return (
    <Box>
      {buffer.length > 0 ? (
        <Text>**********</Text>
      ) : (
        <Text>Waiting for paste...</Text>
      )}
    </Box>
  );
};
