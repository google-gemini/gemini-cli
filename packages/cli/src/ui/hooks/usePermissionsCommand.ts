/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

export function usePermissionsCommand() {
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);

  const openPermissionsDialog = useCallback(() => {
    setIsPermissionsDialogOpen(true);
  }, []);

  const closePermissionsDialog = useCallback(() => {
    setIsPermissionsDialogOpen(false);
  }, []);

  return {
    isPermissionsDialogOpen,
    openPermissionsDialog,
    closePermissionsDialog,
  };
}
