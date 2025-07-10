/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';

export const usePromptsFromFilesCommand = () => {
  const [isPromptsFromFilesDialogOpen, setIsPromptsFromFilesDialogOpen] =
    useState(false);

  const openPromptsFromFilesDialog = useCallback(() => {
    setIsPromptsFromFilesDialogOpen(true);
  }, []);

  const closePromptsFromFilesDialog = useCallback(() => {
    setIsPromptsFromFilesDialogOpen(false);
  }, []);

  return {
    isPromptsFromFilesDialogOpen,
    openPromptsFromFilesDialog,
    closePromptsFromFilesDialog,
  };
};
