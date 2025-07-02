/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

export const usePromptsCommand = () => {
  const [isPromptsDialogOpen, setIsPromptsDialogOpen] = useState(false);

  const openPromptsDialog = useCallback(() => {
    setIsPromptsDialogOpen(true);
  }, []);

  const closePromptsDialog = useCallback(() => {
    setIsPromptsDialogOpen(false);
  }, []);

  return {
    isPromptsDialogOpen,
    openPromptsDialog,
    closePromptsDialog,
  };
};
