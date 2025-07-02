/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext } from 'react';
import { StreamingState } from '../types.js';

export const StreamingContext = createContext<StreamingState | undefined>(
  undefined,
);

export const useStreamingContext = (): StreamingState => {
  const context = React.useContext(StreamingContext);
  if (context === undefined) {
    throw new Error(
      'useStreamingContext must be used within a StreamingContextProvider',
    );
  }
  return context;
};
