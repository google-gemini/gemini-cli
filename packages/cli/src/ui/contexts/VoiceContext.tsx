/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { VoiceInputReturn } from '../hooks/useVoiceInput.js';

export const VoiceContext = createContext<VoiceInputReturn | null>(null);

export const useVoiceContext = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error(
      'useVoiceContext must be used within a VoiceContext.Provider',
    );
  }
  return context;
};

// Re-export event subscription for convenience
export { onVoiceTranscript } from '../hooks/useVoiceInput.js';
