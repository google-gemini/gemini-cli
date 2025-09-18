/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';

export const FocusContext = createContext<boolean>(true);

export const useFocusState = () => useContext(FocusContext);
