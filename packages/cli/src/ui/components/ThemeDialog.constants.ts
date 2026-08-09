/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** The fraction of the dialog width allocated to the selection (left) pane. */
export const SELECTION_PANE_WIDTH_PERCENTAGE = 0.45;

/** The fraction of the dialog width allocated to the preview (right) pane. */
export const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;

/**
 * A safety margin to prevent text from touching the preview pane border.
 * Note: This is specific to the ThemeDialog layout and is unrelated to
 * SHELL_WIDTH_FRACTION in AppContainer.
 */
export const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;

/**
 * Combined horizontal padding from the dialog and preview pane used
 * to calculate available width for the code preview.
 */
export const TOTAL_HORIZONTAL_PADDING = 4;

/** Padding for the dialog container. */
export const DIALOG_PADDING = 2;

/** Fixed vertical space taken by preview pane elements (title, borders, margins). */
export const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

/** Height of the tab/scope selection hint at the bottom. */
export const TAB_TO_SELECT_HEIGHT = 2;
